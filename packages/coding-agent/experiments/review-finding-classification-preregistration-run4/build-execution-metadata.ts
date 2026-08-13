import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExecutionMetadata } from "./evaluate.js";

type Arm = "RUN_A_CONTROL" | "RUN_B_OPUS5";
type Condition = "A" | "B";
type Reviewer = "codex" | "claude";

const SOURCE_SHA = "bd247656aeeabea6b347bc892c0bfb9236fd7663";
const PROMPT_SHA256 = { A: "195cdf794aa2622f006e98dda49e9859a41b52d609996d3d10c22ee3c27b1357", B: "57ee2b3a0728fd1678fcdd8fcfe0b38f3b6c2b7ec09fbaf9a3e630648cf4a89e" } as const;
const RESPONSE_SCHEMA_SHA256 = { A: "2d9cfaaff9402f16ef0d70c389386a68fddb63b300f416971b83d392bf16b616", B: "38d3a1d238637fedf867936013817772ea822a57d2e89516974347a96b1af36e" } as const;

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readExitCode(path: string): number {
	const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
	assert(Number.isInteger(value), `Invalid exit code in ${path}`);
	return value;
}

function codexUsage(eventsPath: string) {
	let completedTurns = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	for (const line of readFileSync(eventsPath, "utf8").split("\n").filter((entry) => entry.trim().length > 0)) {
		const event = JSON.parse(line) as unknown;
		if (!isRecord(event) || event.type !== "turn.completed") continue;
		assert(isRecord(event.usage), "Codex turn completion has no usage");
		assert(typeof event.usage.input_tokens === "number" && typeof event.usage.output_tokens === "number", "Codex usage is incomplete");
		completedTurns += 1;
		inputTokens += event.usage.input_tokens;
		outputTokens += event.usage.output_tokens;
	}
	assert(completedTurns === 1, "Codex evidence must contain exactly one completed turn");
	return [{ model: "gpt-5.6-sol", canonicalModel: "gpt-5.6-sol", provider: "openai", inputTokens, outputTokens }];
}

function claudeUsage(rawPath: string) {
	const envelope = JSON.parse(readFileSync(rawPath, "utf8")) as unknown;
	assert(isRecord(envelope) && isRecord(envelope.modelUsage), "Claude modelUsage is missing");
	return Object.entries(envelope.modelUsage).map(([model, value]) => {
		assert(isRecord(value), `Claude modelUsage for ${model} is invalid`);
		assert(
			typeof value.canonicalModel === "string" &&
				typeof value.provider === "string" &&
				typeof value.inputTokens === "number" &&
				typeof value.outputTokens === "number",
			`Claude modelUsage for ${model} is incomplete`,
		);
		return {
			model,
			canonicalModel: value.canonicalModel,
			provider: value.provider,
			inputTokens: value.inputTokens,
			outputTokens: value.outputTokens,
		};
	});
}

export function buildMetadata(
	arm: Arm,
	preregistrationSha: string,
	resultsDir: string,
	outputsMutuallyHiddenUntilFrozen: boolean,
): ExecutionMetadata {
	assert(/^[0-9a-f]{40}$/.test(preregistrationSha), "Invalid preregistration SHA");
	assert(outputsMutuallyHiddenUntilFrozen, "Mutual-hiding attestation is required");
	const invocations = (["A", "B"] as const).flatMap((condition) =>
		(["codex", "claude"] as const).map((reviewer) => {
			const stem = `condition-${condition.toLowerCase()}-${reviewer}`;
			const rawName = reviewer === "codex" ? `${stem}-final.json` : `${stem}.json`;
			const rawArtifact = `raw/${rawName}`;
			const rawPath = join(resultsDir, rawArtifact);
			const exitCode = readExitCode(join(resultsDir, "raw", `${stem}-exit.txt`));
			if (reviewer === "codex") {
				const eventsArtifact = `raw/${stem}-events.jsonl`;
				const eventsPath = join(resultsDir, eventsArtifact);
				return {
					condition,
					reviewer,
					tool: "codex-cli",
					toolVersion: "0.146.0",
					requestedModel: "gpt-5.6-sol",
					exitCode,
					promptSha256: PROMPT_SHA256[condition],
					responseSchemaSha256: RESPONSE_SCHEMA_SHA256[condition],
					rawArtifact,
					rawArtifactSha256: sha256(rawPath),
					eventsArtifact,
					eventsArtifactSha256: sha256(eventsPath),
					modelUsage: codexUsage(eventsPath),
				};
			}
			return {
				condition,
				reviewer,
				tool: "Claude Code",
				toolVersion: "2.1.228",
				requestedModel: arm === "RUN_A_CONTROL" ? "claude-opus-4-6" : "claude-opus-5",
				exitCode,
				promptSha256: PROMPT_SHA256[condition],
				responseSchemaSha256: RESPONSE_SCHEMA_SHA256[condition],
				rawArtifact,
				rawArtifactSha256: sha256(rawPath),
				modelUsage: claudeUsage(rawPath),
			};
		}),
	);
	return {
		schemaVersion: 1,
		arm,
		sourceSha: SOURCE_SHA,
		preregistrationSha,
		corpusVersion: "frozen-1",
		blindCorpusSha256: "b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b",
		goldPairsSha256: "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b",
		outputsMutuallyHiddenUntilFrozen,
		invocations,
	};
}

function main(): void {
	const [, , arm, preregistrationSha, resultsDir, attestation, outputPath] = process.argv;
	if (
		(arm !== "RUN_A_CONTROL" && arm !== "RUN_B_OPUS5") ||
		!preregistrationSha ||
		!resultsDir ||
		attestation !== "ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN" ||
		!outputPath
	) {
		throw new Error(
			"Usage: build-execution-metadata.ts <RUN_A_CONTROL|RUN_B_OPUS5> <preregistration-sha> <results-dir> ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN <output.json>",
		);
	}
	writeFileSync(outputPath, `${JSON.stringify(buildMetadata(arm, preregistrationSha, resultsDir, true), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
