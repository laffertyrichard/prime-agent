import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCorpus } from "../validate-corpus.js";
import { scanClassificationOutput, validateSourceArtifacts } from "./validate-frozen.js";
import blind from "./blind-corpus.json" with { type: "json" };
import gold from "./gold-pairs.json" with { type: "json" };
import provenance from "./provenance-corpus.json" with { type: "json" };

describe("frozen corpus gate", () => {
	it("accepts every frozen blind, provenance, and gold record mechanically", () => {
		expect(
			validateCorpus(
				blind as Parameters<typeof validateCorpus>[0],
				provenance as Parameters<typeof validateCorpus>[1],
				gold as Parameters<typeof validateCorpus>[2],
			),
		).toEqual([]);
	});

	it("contains audit decisions but no classification output fields", () => {
		const codex = JSON.parse(
			readFileSync(new URL("../audits/round-2/codex-final.json", import.meta.url), "utf8"),
		) as unknown;
		const claude = JSON.parse(
			readFileSync(new URL("../audits/round-2/claude-final.json", import.meta.url), "utf8"),
		) as unknown;
		expect(scanClassificationOutput(codex)).toEqual([]);
		expect(scanClassificationOutput(claude)).toEqual([]);
	});

	it("detects source artifact and excerpt tampering", () => {
		const root = mkdtempSync(join(tmpdir(), "corpus-source-canary-"));
		try {
			const content = "one atomic source excerpt";
			writeFileSync(join(root, "source.txt"), content);
			const sourceCorpus = {
				corpusVersion: "canary",
				items: [
					{
						itemId: "item-000000000001",
						sourceArtifact: "source.txt",
						sourceArtifactSha256: createHash("sha256").update(content).digest("hex"),
						sourceExcerpt: content,
						sourceExcerptSha256: createHash("sha256").update(content).digest("hex"),
						sourceLineRange: [1, 1] as [number, number],
						neutralization: { manifestation: "A neutral manifestation." },
					},
				],
			};
			expect(validateSourceArtifacts(sourceCorpus, root)).toEqual([]);
			writeFileSync(join(root, "source.txt"), "tampered");
			expect(validateSourceArtifacts(sourceCorpus, root).map((finding) => finding.rule)).toEqual([
				"source-artifact-hash-mismatch",
				"source-excerpt-occurrence",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
