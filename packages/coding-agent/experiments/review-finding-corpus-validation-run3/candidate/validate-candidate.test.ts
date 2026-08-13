import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCorpus } from "../validate-corpus.js";

const candidateRoot = new URL("./", import.meta.url);
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(new URL(relativePath, candidateRoot), "utf8")) as unknown;

describe("candidate corpus mechanical gate", () => {
	it("accepts the complete candidate corpus", () => {
		expect(
			validateCorpus(
				readJson("blind-corpus.json") as Parameters<typeof validateCorpus>[0],
				readJson("provenance-corpus.json") as Parameters<typeof validateCorpus>[1],
				readJson("gold-pairs.json") as Parameters<typeof validateCorpus>[2],
			),
		).toEqual([]);
	});
});
