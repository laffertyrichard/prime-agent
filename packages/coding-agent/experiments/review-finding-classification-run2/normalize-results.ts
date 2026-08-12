import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ReviewerResult } from "./evaluate.js";

function parseJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractCodex(value: unknown): ReviewerResult {
	if (!isRecord(value) || (value.condition !== "A" && value.condition !== "B")) {
		throw new Error("Codex final output is not a condition result");
	}
	return value as unknown as ReviewerResult;
}

export function extractClaude(value: unknown): ReviewerResult {
	if (!isRecord(value)) throw new Error("Claude raw output is not an object");
	const candidate = value.structured_output ?? value.result;
	const parsed = typeof candidate === "string" ? (JSON.parse(candidate) as unknown) : candidate;
	if (!isRecord(parsed) || (parsed.condition !== "A" && parsed.condition !== "B")) {
		throw new Error("Claude output contains no structured condition result");
	}
	return parsed as unknown as ReviewerResult;
}

function main(): void {
	const [, , aCodexPath, aClaudePath, bCodexPath, bClaudePath, outputPath] = process.argv;
	if (!aCodexPath || !aClaudePath || !bCodexPath || !bClaudePath || !outputPath) {
		throw new Error(
			"Usage: normalize-results.ts <a-codex-final> <a-claude-raw> <b-codex-final> <b-claude-raw> <evaluation-input.json>",
		);
	}
	const output = {
		conditions: {
			A: { codex: extractCodex(parseJson(aCodexPath)), claude: extractClaude(parseJson(aClaudePath)) },
			B: { codex: extractCodex(parseJson(bCodexPath)), claude: extractClaude(parseJson(bClaudePath)) },
		},
	};
	writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
