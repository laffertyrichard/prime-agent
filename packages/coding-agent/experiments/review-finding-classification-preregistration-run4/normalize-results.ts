import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ReviewerResult } from "./evaluate.js";

type Arm = "RUN_A_CONTROL" | "RUN_B_OPUS5";

function parseJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewerResult(value: unknown, condition: "A" | "B"): value is ReviewerResult {
	return isRecord(value) && value.condition === condition && Array.isArray(value.classifications);
}

export function extractCodex(value: unknown, condition: "A" | "B"): ReviewerResult {
	if (!isReviewerResult(value, condition)) throw new Error(`Codex output is not a Condition ${condition} result`);
	return value;
}

export function extractClaude(value: unknown, condition: "A" | "B"): ReviewerResult {
	if (!isRecord(value)) throw new Error("Claude raw output is not an object");
	const candidate = value.structured_output ?? value.result;
	const parsed = typeof candidate === "string" ? (JSON.parse(candidate) as unknown) : candidate;
	if (!isReviewerResult(parsed, condition)) throw new Error(`Claude output is not a Condition ${condition} result`);
	return parsed;
}

export function normalize(
	arm: Arm,
	conditionACodex: unknown,
	conditionAClaude: unknown,
	conditionBCodex: unknown,
	conditionBClaude: unknown,
) {
	return {
		schemaVersion: 1,
		arm,
		conditions: {
			A: {
				codex: extractCodex(conditionACodex, "A"),
				claude: extractClaude(conditionAClaude, "A"),
			},
			B: {
				codex: extractCodex(conditionBCodex, "B"),
				claude: extractClaude(conditionBClaude, "B"),
			},
		},
	};
}

function main(): void {
	const [, , arm, conditionACodexPath, conditionAClaudePath, conditionBCodexPath, conditionBClaudePath, outputPath] = process.argv;
	if (
		(arm !== "RUN_A_CONTROL" && arm !== "RUN_B_OPUS5") ||
		!conditionACodexPath ||
		!conditionAClaudePath ||
		!conditionBCodexPath ||
		!conditionBClaudePath ||
		!outputPath
	) {
		throw new Error(
			"Usage: normalize-results.ts <RUN_A_CONTROL|RUN_B_OPUS5> <a-codex.json> <a-claude.json> <b-codex.json> <b-claude.json> <normalized.json>",
		);
	}
	const result = normalize(
		arm,
		parseJson(conditionACodexPath),
		parseJson(conditionAClaudePath),
		parseJson(conditionBCodexPath),
		parseJson(conditionBClaudePath),
	);
	writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
