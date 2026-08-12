import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCorpus } from "../validate-corpus.js";

interface SourceItem {
	itemId: string;
	sourceArtifact: string;
	sourceArtifactSha256: string;
	sourceExcerpt: string;
	sourceExcerptSha256?: string;
	sourceLineRange?: [number, number];
}

interface SourceCorpus {
	items: SourceItem[];
}

interface Finding {
	rule: string;
	location: string;
	detail: string;
}

export function validateSourceArtifacts(provenance: SourceCorpus, sourceRoot: string): Finding[] {
	const findings: Finding[] = [];
	const contents = new Map<string, string>();
	for (const item of provenance.items) {
		if (item.sourceArtifact.startsWith("/") || item.sourceArtifact.split("/").includes("..")) {
			findings.push({ rule: "unsafe-source-path", location: item.itemId, detail: item.sourceArtifact });
			continue;
		}
		let content = contents.get(item.sourceArtifact);
		if (content === undefined) {
			try {
				content = readFileSync(join(sourceRoot, item.sourceArtifact), "utf8");
				contents.set(item.sourceArtifact, content);
			} catch {
				findings.push({ rule: "missing-source-artifact", location: item.itemId, detail: item.sourceArtifact });
				continue;
			}
		}
		if (createHash("sha256").update(content).digest("hex") !== item.sourceArtifactSha256) {
			findings.push({ rule: "source-artifact-hash-mismatch", location: item.itemId, detail: item.sourceArtifact });
		}
		if (
			item.sourceExcerptSha256 !== undefined &&
			createHash("sha256").update(item.sourceExcerpt).digest("hex") !== item.sourceExcerptSha256
		) {
			findings.push({ rule: "source-excerpt-hash-mismatch", location: item.itemId, detail: item.sourceArtifact });
		}
		const occurrences = content.split(item.sourceExcerpt).length - 1;
		if (occurrences === 1 && item.sourceLineRange !== undefined) {
			const position = content.indexOf(item.sourceExcerpt);
			const startLine = content.slice(0, position).split("\n").length;
			const endLine = startLine + item.sourceExcerpt.split("\n").length - 1;
			if (item.sourceLineRange[0] !== startLine || item.sourceLineRange[1] !== endLine) {
				findings.push({ rule: "source-line-range-mismatch", location: item.itemId, detail: item.sourceArtifact });
			}
		}
		if (occurrences !== 1) {
			findings.push({
				rule: "source-excerpt-occurrence",
				location: item.itemId,
				detail: `${item.sourceArtifact} contains the excerpt ${occurrences} times`,
			});
		}
	}
	return findings;
}

export function scanClassificationOutput(value: unknown, location = "$"): Finding[] {
	const findings: Finding[] = [];
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) findings.push(...scanClassificationOutput(item, `${location}[${index}]`));
		return findings;
	}
	if (typeof value !== "object" || value === null) return findings;
	for (const [key, child] of Object.entries(value)) {
		const childLocation = `${location}.${key}`;
		if (/^(?:rootClass|rootCause|relation|pairDecision|classifications)$/i.test(key)) {
			findings.push({ rule: "classification-output-field", location: childLocation, detail: key });
		}
		findings.push(...scanClassificationOutput(child, childLocation));
	}
	return findings;
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function main(): void {
	const [, , blindPath, provenancePath, goldPath, outputPath, sourceRoot] = process.argv;
	if (!blindPath || !provenancePath || !goldPath || !outputPath || !sourceRoot) {
		throw new Error("Usage: validate-frozen.ts <blind.json> <provenance.json> <gold.json> <output.json> <source-root>");
	}
	const provenance = readJson(provenancePath) as SourceCorpus;
	const findings = validateCorpus(
		readJson(blindPath) as Parameters<typeof validateCorpus>[0],
		provenance as Parameters<typeof validateCorpus>[1],
		readJson(goldPath) as Parameters<typeof validateCorpus>[2],
	);
	findings.push(...validateSourceArtifacts(provenance, sourceRoot));
	writeFileSync(outputPath, `${JSON.stringify({ valid: findings.length === 0, findings }, null, 2)}\n`);
	if (findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
