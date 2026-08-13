import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCodexEvents, type ExecutionMetadata } from "./evaluate.js";
import { assertExecutionWorktree, readAndValidateExecutionPreflight } from "./execution-preflight.js";

type Arm = "RUN_A_CONTROL" | "RUN_B_OPUS5";
type Reviewer = "codex" | "claude";

const SOURCE_SHA = "bd247656aeeabea6b347bc892c0bfb9236fd7663";

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
	const parsed = parseCodexEvents(readFileSync(eventsPath, "utf8"));
	return [
		{
			model: "gpt-5.6-sol",
			canonicalModel: "gpt-5.6-sol",
			provider: "openai",
			inputTokens: parsed.inputTokens,
			outputTokens: parsed.outputTokens,
		},
	];
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
	repositoryRoot: string,
	experimentRoot: string,
	resultsDir: string,
	outputsMutuallyHiddenUntilFrozen: boolean,
): ExecutionMetadata {
	assert(/^[0-9a-f]{40}$/.test(preregistrationSha), "Invalid preregistration SHA");
	assert(outputsMutuallyHiddenUntilFrozen, "Mutual-hiding attestation is required");
	assertExecutionWorktree(repositoryRoot, experimentRoot, preregistrationSha);
	const preflightArtifact = "raw/execution-preflight.json";
	const preflightPath = join(resultsDir, preflightArtifact);
	const preflight = readAndValidateExecutionPreflight(preflightPath, resultsDir, experimentRoot, preregistrationSha);
	const invocations = (["A", "B"] as const).flatMap((condition) =>
		(["codex", "claude"] as const).map((reviewer: Reviewer) => {
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
					tool: preflight.cliVersions.codex.tool,
					toolVersion: preflight.cliVersions.codex.version,
					requestedModel: "gpt-5.6-sol",
					exitCode,
					promptSha256: preflight.promptSha256[condition],
					responseSchemaSha256: preflight.responseSchemaSha256[condition],
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
				tool: preflight.cliVersions.claude.tool,
				toolVersion: preflight.cliVersions.claude.version,
				requestedModel: arm === "RUN_A_CONTROL" ? "claude-opus-4-6" : "claude-opus-5",
				exitCode,
				promptSha256: preflight.promptSha256[condition],
				responseSchemaSha256: preflight.responseSchemaSha256[condition],
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
		executionPreflightArtifact: preflightArtifact,
		executionPreflightArtifactSha256: sha256(preflightPath),
		invocations,
	};
}

function main(): void {
	const [, , arm, preregistrationSha, repositoryRoot, experimentRoot, resultsDir, attestation, outputPath] = process.argv;
	if (
		(arm !== "RUN_A_CONTROL" && arm !== "RUN_B_OPUS5") ||
		!preregistrationSha ||
		!repositoryRoot ||
		!experimentRoot ||
		!resultsDir ||
		attestation !== "ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN" ||
		!outputPath
	) {
		throw new Error(
			"Usage: build-execution-metadata.ts <RUN_A_CONTROL|RUN_B_OPUS5> <preregistration-sha> <repository-root> <experiment-root> <results-dir> ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN <output.json>",
		);
	}
	writeFileSync(
		outputPath,
		`${JSON.stringify(buildMetadata(arm, preregistrationSha, repositoryRoot, experimentRoot, resultsDir, true), null, 2)}\n`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
