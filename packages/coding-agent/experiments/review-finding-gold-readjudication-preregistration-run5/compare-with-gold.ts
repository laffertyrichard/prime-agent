import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	assert,
	assertExactKeys,
	compareWithOriginal,
	determineFinalDecision,
	isRecord,
	type BinaryRelation,
	type FinalDecision,
} from "./adjudication-lib.js";

interface CaseMapping {
	caseId: string;
	sourcePairId: string;
	manifestationAItemId: string;
	manifestationBItemId: string;
}

interface GoldPair {
	pairId: string;
	leftItemId: string;
	rightItemId: string;
	relation: BinaryRelation;
}

const SOURCE_EVIDENCE_SHA = "f1450e95a197b91998550566e36484f046a2a8ed";
const ORIGINAL_GOLD_SHA256 = "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b";

function readObject(path: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	assert(isRecord(parsed), `Expected object in ${path}`);
	return parsed;
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseCaseMap(path: string): { mappings: CaseMapping[]; salt: string } {
	const root = readObject(path);
	assertExactKeys(root, ["schemaVersion", "mappingVersion", "sourceEvidenceSha", "constructionSaltHex", "constructionMethod", "caseCount", "cases"], path);
	assert(root.schemaVersion === 1 && root.sourceEvidenceSha === SOURCE_EVIDENCE_SHA && root.caseCount === 16 && Array.isArray(root.cases), "Invalid case map root");
	assert(typeof root.constructionSaltHex === "string" && /^[0-9a-f]{64}$/.test(root.constructionSaltHex), "Invalid construction salt");
	assert(root.cases.length === 16, "Case map count mismatch");
	const mappings = root.cases.map((entry, index) => {
		assert(isRecord(entry), `Invalid case map entry ${index}`);
		assertExactKeys(entry, ["caseId", "sourcePairId", "manifestationAItemId", "manifestationBItemId"], `case map ${index}`);
		for (const key of ["caseId", "sourcePairId", "manifestationAItemId", "manifestationBItemId"] as const) assert(typeof entry[key] === "string", `Invalid ${key}: case map ${index}`);
		return entry as unknown as CaseMapping;
	});
	const salt = root.constructionSaltHex;
	const expected = [...mappings].sort((left, right) => {
		const leftDigest = createHmac("sha256", Buffer.from(salt, "hex")).update(left.sourcePairId).digest("hex");
		const rightDigest = createHmac("sha256", Buffer.from(salt, "hex")).update(right.sourcePairId).digest("hex");
		return leftDigest.localeCompare(rightDigest);
	});
	assert(JSON.stringify(mappings.map((entry) => entry.caseId)) === JSON.stringify(expected.map((entry) => entry.caseId)), "Case map order is not relation-independent HMAC order");
	for (const mapping of mappings) {
		const digest = createHmac("sha256", Buffer.from(salt, "hex")).update(mapping.sourcePairId).digest("hex");
		assert(mapping.caseId === `case-${digest.slice(0, 32)}`, `Case alias derivation mismatch: ${mapping.caseId}`);
	}
	return { mappings, salt };
}

function parseGold(path: string): GoldPair[] {
	assert(sha256(path) === ORIGINAL_GOLD_SHA256, "Original gold bytes changed");
	const root = readObject(path);
	assert(Array.isArray(root.pairs) && root.pairs.length === 16, "Gold pair count mismatch");
	return root.pairs.map((entry, index) => {
		assert(isRecord(entry), `Invalid gold pair ${index}`);
		assert(typeof entry.pairId === "string" && typeof entry.leftItemId === "string" && typeof entry.rightItemId === "string", `Invalid gold identity ${index}`);
		assert(entry.relation === "SAME_ROOT" || entry.relation === "DIFFERENT_ROOT", `Invalid gold relation ${index}`);
		return { pairId: entry.pairId, leftItemId: entry.leftItemId, rightItemId: entry.rightItemId, relation: entry.relation };
	});
}

function parseBlindFinal(path: string, expectedHash: string): { caseId: string; finalDecision: FinalDecision; status: string }[] {
	assert(/^[0-9a-f]{64}$/.test(expectedHash) && sha256(path) === expectedHash, "Blind final was not supplied with its frozen hash");
	const root = readObject(path);
	assertExactKeys(root, ["schemaVersion", "sourceEvidenceSha", "authorizedPreregistrationSha", "packetSha256", "responseSha256", "caseCount", "summary", "cases"], path);
	assert(root.schemaVersion === 1 && root.sourceEvidenceSha === SOURCE_EVIDENCE_SHA && root.caseCount === 16 && Array.isArray(root.cases) && root.cases.length === 16, "Invalid blind final root");
	assert(isRecord(root.responseSha256), "Blind final response hashes are missing");
	assertExactKeys(root.responseSha256, ["ADJUDICATOR_CODEX", "ADJUDICATOR_CLAUDE"], "blind final response hashes");
	for (const value of Object.values(root.responseSha256)) assert(typeof value === "string" && /^[0-9a-f]{64}$/.test(value), "Invalid blind final response hash");
	assert(isRecord(root.summary), "Blind final summary is missing");
	assertExactKeys(root.summary, ["confirmedBinary", "unresolvedDisagreement", "unresolvedAbstention"], "blind final summary");
	const cases = root.cases.map((entry, index) => {
		assert(isRecord(entry), `Invalid blind final case ${index}`);
		assertExactKeys(entry, ["caseId", "adjudicatorDecisions", "causalProximity", "confidence", "finalDecision", "status"], `blind final case ${index}`);
		assert(typeof entry.caseId === "string", `Invalid blind final case ID ${index}`);
		assert(isRecord(entry.adjudicatorDecisions), `Missing blind decisions ${index}`);
		assertExactKeys(entry.adjudicatorDecisions, ["ADJUDICATOR_CODEX", "ADJUDICATOR_CLAUDE"], `blind decisions ${index}`);
		const codex = entry.adjudicatorDecisions.ADJUDICATOR_CODEX;
		const claude = entry.adjudicatorDecisions.ADJUDICATOR_CLAUDE;
		assert((codex === "SAME_ROOT" || codex === "DIFFERENT_ROOT" || codex === "ABSTAIN") && (claude === "SAME_ROOT" || claude === "DIFFERENT_ROOT" || claude === "ABSTAIN"), `Invalid blind decisions ${index}`);
		const expected = determineFinalDecision(codex, claude);
		assert(entry.finalDecision === expected.finalDecision && entry.status === expected.status, `Blind final derivation mismatch ${index}`);
		return { caseId: entry.caseId, finalDecision: expected.finalDecision, status: expected.status };
	});
	const count = (status: string): number => cases.filter((entry) => entry.status === status).length;
	assert(root.summary.confirmedBinary === count("CONFIRMED_BINARY") && root.summary.unresolvedDisagreement === count("UNRESOLVED_DISAGREEMENT") && root.summary.unresolvedAbstention === count("UNRESOLVED_ABSTENTION"), "Blind final summary mismatch");
	return cases;
}

export function compareWithGold(experimentRoot: string, goldPath: string, blindFinalPath: string, blindFinalSha256: string): Record<string, unknown> {
	const protocol = readObject(join(experimentRoot, "protocol.json"));
	assert(isRecord(protocol.frozenArtifacts), "Protocol artifact hashes missing");
	const caseMapPath = join(experimentRoot, "sealed/case-map.json");
	assert(protocol.frozenArtifacts["sealed/case-map.json"] === sha256(caseMapPath), "Sealed case map bytes changed");
	const { mappings, salt } = parseCaseMap(caseMapPath);
	const blindCases = parseBlindFinal(blindFinalPath, blindFinalSha256);
	assert(JSON.stringify(blindCases.map((entry) => entry.caseId)) === JSON.stringify(mappings.map((entry) => entry.caseId)), "Blind final and case map coverage mismatch");
	const gold = parseGold(goldPath);
	const goldById = new Map(gold.map((pair) => [pair.pairId, pair]));
	assert(goldById.size === 16 && new Set(mappings.map((entry) => entry.sourcePairId)).size === 16, "Mapping is not a bijection over gold pairs");
	const cases = mappings.map((mapping, index) => {
		const original = goldById.get(mapping.sourcePairId);
		assert(original !== undefined, `Missing mapped gold pair: ${mapping.sourcePairId}`);
		const digest = createHmac("sha256", Buffer.from(salt, "hex")).update(mapping.sourcePairId).digest("hex");
		const expectedItems = Number.parseInt(digest.slice(-1), 16) % 2 === 1 ? [original.rightItemId, original.leftItemId] : [original.leftItemId, original.rightItemId];
		assert(mapping.manifestationAItemId === expectedItems[0] && mapping.manifestationBItemId === expectedItems[1], `Mapped item identity or orientation mismatch: ${mapping.caseId}`);
		const finalDecision = blindCases[index].finalDecision;
		return { caseId: mapping.caseId, sourcePairId: mapping.sourcePairId, finalDecision, originalRelation: original.relation, comparison: compareWithOriginal(finalDecision, original.relation) };
	});
	const count = (comparison: string): number => cases.filter((entry) => entry.comparison === comparison).length;
	return {
		schemaVersion: 1,
		sourceEvidenceSha: SOURCE_EVIDENCE_SHA,
		blindFinalSha256,
		caseCount: cases.length,
		summary: { agreesWithOriginal: count("AGREES_WITH_ORIGINAL"), confirmedGoldChanges: count("CONFIRMED_GOLD_CHANGE"), unresolved: count("UNRESOLVED") },
		cases,
	};
}

function main(): void {
	const [, , experimentRoot, goldPath, blindFinalPath, blindFinalSha256, outputPath] = process.argv;
	if (!experimentRoot || !goldPath || !blindFinalPath || !blindFinalSha256 || !outputPath) throw new Error("Usage: compare-with-gold.ts <experiment-root> <gold-pairs> <blind-final> <blind-final-sha256> <output>");
	writeFileSync(outputPath, `${JSON.stringify(compareWithGold(experimentRoot, goldPath, blindFinalPath, blindFinalSha256), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
