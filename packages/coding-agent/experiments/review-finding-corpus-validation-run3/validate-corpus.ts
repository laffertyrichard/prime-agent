import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface BlindItem {
	itemId: string;
	manifestation: string;
}

interface BlindCorpus {
	schemaVersion: number;
	corpusVersion: string;
	items: BlindItem[];
}

interface ProvenanceItem {
	itemId: string;
	sourceArtifact: string;
	sourceArtifactSha256: string;
	sourceExcerpt: string;
	neutralization: { manifestation: string };
}

interface ProvenanceCorpus {
	corpusVersion: string;
	items: ProvenanceItem[];
}

interface GoldPair {
	pairId: string;
	leftItemId: string;
	rightItemId: string;
	relation: "SAME_ROOT" | "DIFFERENT_ROOT";
}

interface GoldPairs {
	corpusVersion: string;
	pairs: GoldPair[];
}

export interface ValidationFinding {
	rule: string;
	location: string;
	detail: string;
}

const LEAKAGE_RULES: Array<{ rule: string; pattern: RegExp }> = [
	{
		rule: "classification-label",
		pattern: /\b(?:root[ _-]?(?:class|cause)|affected[ _-]?abstraction|ontology|same[ _-]?root|different[ _-]?root)\b/i,
	},
	{
		rule: "severity-or-disposition",
		pattern: /\b(?:blocker|blocking|non[ _-]?blocking|severity|priority|p[0-3]|confirmed|rejected|disposition)\b/i,
	},
	{
		rule: "recommendation-or-remediation",
		pattern: /\b(?:should|must|recommend(?:ed|ation)?|fix(?:ed)?|remediat(?:e|ed|ion)|workaround|solution|instead)\b/i,
	},
	{
		rule: "reviewer-or-model",
		pattern: /\b(?:reviewer|codex|claude|opus|model|provider|anthropic|openai)\b/i,
	},
	{
		rule: "checkpoint-or-escalation",
		pattern: /\b(?:checkpoint|architecture[ _-]?checkpoint|pause[ _-]?local[ _-]?remediation|escalat(?:e|ed|ion))\b/i,
	},
	{
		rule: "provenance",
		pattern: /(?:\b(?:run|review)\s*#?\d+\b|\b[0-9a-f]{40}\b|(?:^|\s)[\w./-]+\.(?:ts|js|json|md):\d+)/i,
	},
	{
		rule: "gold-relationship",
		pattern: /\b(?:SAME_ROOT|DIFFERENT_ROOT|AMBIGUOUS|gold pair|expected relation)\b/i,
	},
];

function normalizeText(value: string): string {
	return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): Set<string> {
	const stop = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "of", "on", "or", "that", "the", "to", "when", "with"]);
	return new Set(normalizeText(value).split(" ").filter((token) => token.length > 2 && !stop.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
	const intersection = [...left].filter((token) => right.has(token)).length;
	const union = new Set([...left, ...right]).size;
	return union === 0 ? 1 : intersection / union;
}

export function scanLeakage(text: string): string[] {
	return LEAKAGE_RULES.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => rule);
}

export function scanAtomicity(text: string): string[] {
	const findings: string[] = [];
	if (text.includes("\n") || /^\s*[-*]\s/m.test(text)) findings.push("multi-part-format");
	const terminalMarks = text.match(/[.!?](?:\s|$)/g)?.length ?? 0;
	if (terminalMarks !== 1 || !/[.!?]$/.test(text.trim())) findings.push("not-one-sentence");
	if (text.length > 400) findings.push("excessive-length");
	return findings;
}

export function findMechanicalDuplicates(items: BlindItem[]): Array<{ leftItemId: string; rightItemId: string; score: number }> {
	const duplicates: Array<{ leftItemId: string; rightItemId: string; score: number }> = [];
	for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
			const left = items[leftIndex];
			const right = items[rightIndex];
			if (!left || !right) continue;
			const exact = normalizeText(left.manifestation) === normalizeText(right.manifestation);
			const score = exact ? 1 : jaccard(tokens(left.manifestation), tokens(right.manifestation));
			if (score >= 0.72) duplicates.push({ leftItemId: left.itemId, rightItemId: right.itemId, score });
		}
	}
	return duplicates;
}

export function validateCorpus(blind: BlindCorpus, provenance: ProvenanceCorpus, gold: GoldPairs): ValidationFinding[] {
	const findings: ValidationFinding[] = [];
	if (blind.corpusVersion !== provenance.corpusVersion || blind.corpusVersion !== gold.corpusVersion) {
		findings.push({ rule: "version-mismatch", location: "corpus", detail: "Corpus versions differ" });
	}
	const blindIds = new Set<string>();
	for (const item of blind.items) {
		if (!/^item-[0-9a-f]{12}$/.test(item.itemId)) {
			findings.push({ rule: "non-opaque-id", location: item.itemId, detail: "Item ID does not use the opaque format" });
		}
		if (blindIds.has(item.itemId)) findings.push({ rule: "duplicate-id", location: item.itemId, detail: "Item ID repeats" });
		blindIds.add(item.itemId);
		for (const rule of scanLeakage(item.manifestation)) findings.push({ rule, location: item.itemId, detail: item.manifestation });
		for (const rule of scanAtomicity(item.manifestation)) findings.push({ rule, location: item.itemId, detail: item.manifestation });
	}
	const provenanceIds = new Set(provenance.items.map((item) => item.itemId));
	if (blindIds.size !== provenanceIds.size || [...blindIds].some((id) => !provenanceIds.has(id))) {
		findings.push({ rule: "blind-provenance-id-mismatch", location: "corpus", detail: "Blind and provenance item IDs differ" });
	}
	for (const item of provenance.items) {
		const blindItem = blind.items.find((candidate) => candidate.itemId === item.itemId);
		if (blindItem?.manifestation !== item.neutralization.manifestation) {
			findings.push({ rule: "neutralization-mismatch", location: item.itemId, detail: "Provenance neutralization differs from blind text" });
		}
		if (!/^[0-9a-f]{64}$/.test(item.sourceArtifactSha256) || item.sourceExcerpt.trim().length === 0) {
			findings.push({ rule: "incomplete-provenance", location: item.itemId, detail: "Source hash or excerpt is missing" });
		}
	}
	for (const duplicate of findMechanicalDuplicates(blind.items)) {
		findings.push({ rule: "mechanical-duplicate", location: `${duplicate.leftItemId}/${duplicate.rightItemId}`, detail: `Jaccard score ${duplicate.score.toFixed(3)}` });
	}
	const pairIds = new Set<string>();
	const itemPairs = new Set<string>();
	for (const pair of gold.pairs) {
		if (!/^pair-[0-9a-f]{10}$/.test(pair.pairId) || pairIds.has(pair.pairId)) {
			findings.push({ rule: "invalid-pair-id", location: pair.pairId, detail: "Pair ID is invalid or repeated" });
		}
		pairIds.add(pair.pairId);
		if (!blindIds.has(pair.leftItemId) || !blindIds.has(pair.rightItemId) || pair.leftItemId === pair.rightItemId) {
			findings.push({ rule: "invalid-pair-items", location: pair.pairId, detail: "Pair references invalid items" });
		}
		const key = [pair.leftItemId, pair.rightItemId].sort().join("/");
		if (itemPairs.has(key)) findings.push({ rule: "duplicate-pair", location: pair.pairId, detail: "Item pair repeats" });
		itemPairs.add(key);
	}
	return findings;
}

export function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function main(): void {
	const [, , blindPath, provenancePath, goldPath, outputPath] = process.argv;
	if (!blindPath || !provenancePath || !goldPath || !outputPath) {
		throw new Error("Usage: validate-corpus.ts <blind.json> <provenance.json> <gold.json> <output.json>");
	}
	const findings = validateCorpus(readJson<BlindCorpus>(blindPath), readJson<ProvenanceCorpus>(provenancePath), readJson<GoldPairs>(goldPath));
	writeFileSync(outputPath, `${JSON.stringify({ valid: findings.length === 0, findings }, null, 2)}\n`);
	if (findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
