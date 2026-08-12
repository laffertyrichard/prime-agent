import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMechanicalDuplicates, scanAtomicity, scanLeakage, validateCorpus } from "./validate-corpus.js";

const experimentRoot = new URL("./", import.meta.url);
const readJson = <T>(relativePath: string): T => JSON.parse(readFileSync(new URL(relativePath, experimentRoot), "utf8")) as T;

describe("corpus-validation mechanical gate", () => {
	it("detects every seeded leakage and atomicity canary", () => {
		const canaries = readJson<{
			leakage: Array<{ text: string; expectedRule: string }>;
			atomicity: Array<{ text: string; expectedRule: string }>;
			duplicates: Array<{ left: { itemId: string; manifestation: string }; right: { itemId: string; manifestation: string } }>;
		}>("canaries/mechanical-canaries.json");
		for (const canary of canaries.leakage) expect(scanLeakage(canary.text)).toContain(canary.expectedRule);
		for (const canary of canaries.atomicity) expect(scanAtomicity(canary.text)).toContain(canary.expectedRule);
		expect(findMechanicalDuplicates([canaries.duplicates[0]!.left, canaries.duplicates[0]!.right])).toHaveLength(1);
	});

	it("accepts the complete draft corpus mechanically", () => {
		const findings = validateCorpus(
			readJson("draft/blind-corpus.json"),
			readJson("draft/provenance-corpus.json"),
			readJson("draft/gold-pairs.json"),
		);
		expect(findings).toEqual([]);
	});
});
