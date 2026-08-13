import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { assert, isRecord } from "./adjudication-lib.js";

const SOURCE_EVIDENCE_SHA = "f1450e95a197b91998550566e36484f046a2a8ed";

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateRawManifest(manifestPath: string): Map<string, string> {
	const root = dirname(manifestPath);
	const lines = readFileSync(manifestPath, "utf8").trim().split("\n");
	const entries = new Map<string, string>();
	for (const line of lines) {
		const match = /^([0-9a-f]{64})  ([^/].*)$/.exec(line);
		assert(match !== null && !match[2].split("/").includes("..") && !entries.has(match[2]), `Invalid raw manifest line: ${line}`);
		assert(sha256(join(root, match[2])) === match[1], `Raw prefreeze manifest mismatch: ${match[2]}`);
		entries.set(match[2], match[1]);
	}
	return entries;
}

function assertManifested(entries: Map<string, string>, manifestPath: string, artifactPath: string): void {
	const relativePath = relative(dirname(manifestPath), artifactPath).replaceAll("\\", "/");
	assert(!relativePath.startsWith("../") && entries.get(relativePath) === sha256(artifactPath), `Raw artifact is not bound to prefreeze manifest: ${artifactPath}`);
}

function readExitCode(path: string): number {
	const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
	assert(Number.isInteger(value), `Invalid exit code in ${path}`);
	return value;
}

function validateCodexEvents(path: string): Record<string, unknown> {
	const lines = readFileSync(path, "utf8").trim().split("\n");
	assert(lines.length > 0, "Codex event stream is empty");
	let completed = false;
	let response: Record<string, unknown> | undefined;
	for (const [index, line] of lines.entries()) {
		const parsed = JSON.parse(line) as unknown;
		assert(isRecord(parsed) && typeof parsed.type === "string", `Invalid Codex event ${index}`);
		assert(["thread.started", "turn.started", "item.completed", "turn.completed"].includes(parsed.type), `Unexpected Codex event type: ${parsed.type}`);
		if (parsed.type === "item.completed") {
			assert(isRecord(parsed.item) && parsed.item.type === "agent_message" && typeof parsed.item.text === "string", "Codex tool or non-message item observed");
			const itemResponse = JSON.parse(parsed.item.text) as unknown;
			assert(isRecord(itemResponse) && response === undefined, "Codex event stream has invalid response messages");
			response = itemResponse;
		}
		if (parsed.type === "turn.completed") completed = true;
	}
	assert(completed && response !== undefined, "Codex turn did not complete with one response");
	return response;
}

function claudeEffectiveModels(path: string): string[] {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	assert(isRecord(parsed) && parsed.is_error === false && Array.isArray(parsed.permission_denials) && parsed.permission_denials.length === 0, "Invalid Claude execution envelope");
	assert(isRecord(parsed.modelUsage), "Claude modelUsage is missing");
	const models = Object.entries(parsed.modelUsage).filter(([model, value]) => {
		assert(isRecord(value), "Invalid Claude modelUsage entry");
		assert(value.provider === "firstParty" && value.canonicalModel === model, "Claude provider or canonical model mismatch");
		assert(typeof value.inputTokens === "number" && typeof value.outputTokens === "number", "Claude token evidence is missing");
		return value.inputTokens + value.outputTokens > 0;
	}).map(([model]) => model);
	assert(models.every((model) => model === "claude-opus-5" || model === "claude-fable-5"), "Claude effective model set is not allowed");
	const canonicalOrder: string[] = ["claude-opus-5", "claude-fable-5"];
	const canonical = canonicalOrder.filter((model) => models.some((observed) => observed === model));
	assert(canonical[0] === "claude-opus-5", "Claude primary model usage is missing");
	return canonical;
}

export function buildExecutionMetadata(
	preregistrationSha: string,
	rawManifestPath: string,
	preflightPath: string,
	promptPath: string,
	schemaPath: string,
	codexResponsePath: string,
	codexEventsPath: string,
	codexExitPath: string,
	claudeResponsePath: string,
	claudeRawPath: string,
	claudeExitPath: string,
): Record<string, unknown> {
	assert(/^[0-9a-f]{40}$/.test(preregistrationSha), "Invalid preregistration SHA");
	const rawManifest = validateRawManifest(rawManifestPath);
	for (const artifactPath of [preflightPath, codexResponsePath, codexEventsPath, codexExitPath, claudeRawPath, claudeExitPath]) assertManifested(rawManifest, rawManifestPath, artifactPath);
	const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as unknown;
	assert(isRecord(preflight) && preflight.authorizedPreregistrationSha === preregistrationSha && preflight.sourceEvidenceSha === SOURCE_EVIDENCE_SHA, "Execution preflight identity mismatch");
	assert(preflight.promptSha256 === sha256(promptPath) && preflight.responseSchemaSha256 === sha256(schemaPath), "Execution preflight artifact mismatch");
	assert(preflight.headSha256 === createHash("sha256").update(`${preregistrationSha}\n`).digest("hex"), "Execution preflight HEAD evidence mismatch");
	assert(preflight.cleanStatusSha256 === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "Execution preflight worktree was not clean");
	assert(preflight.codexVersionSha256 === createHash("sha256").update("codex-cli 0.146.0\n").digest("hex"), "Codex version evidence mismatch");
	assert(preflight.claudeVersionSha256 === createHash("sha256").update("2.1.228 (Claude Code)\n").digest("hex"), "Claude version evidence mismatch");
	const codexEventResponse = validateCodexEvents(codexEventsPath);
	const codexResponse = JSON.parse(readFileSync(codexResponsePath, "utf8")) as unknown;
	assert(isRecord(codexResponse) && JSON.stringify(codexResponse) === JSON.stringify(codexEventResponse), "Codex response does not match event evidence");
	const claudeEnvelope = JSON.parse(readFileSync(claudeRawPath, "utf8")) as unknown;
	const claudeResponse = JSON.parse(readFileSync(claudeResponsePath, "utf8")) as unknown;
	assert(isRecord(claudeEnvelope) && isRecord(claudeEnvelope.structured_output) && isRecord(claudeResponse) && JSON.stringify(claudeResponse) === JSON.stringify(claudeEnvelope.structured_output), "Claude response does not match envelope evidence");
	const effectiveClaudeModels = claudeEffectiveModels(claudeRawPath);
	return {
		schemaVersion: 1,
		authorizedPreregistrationSha: preregistrationSha,
		sourceEvidenceSha: SOURCE_EVIDENCE_SHA,
		rawPrefreezeManifestSha256: sha256(rawManifestPath),
		executionPreflightSha256: sha256(preflightPath),
		promptSha256: sha256(promptPath),
		responseSchemaSha256: sha256(schemaPath),
		outputsMutuallyHiddenUntilFrozen: true,
		adjudicators: [
			{ adjudicatorId: "ADJUDICATOR_CODEX", tool: "codex-cli", toolVersion: "0.146.0", requestedModel: "gpt-5.6-sol", effectiveModels: ["gpt-5.6-sol"], provider: "openai", exitCode: readExitCode(codexExitPath), outputSha256: sha256(codexResponsePath), toolUseObserved: false, rawEvidenceSha256: sha256(codexResponsePath), telemetrySha256: sha256(codexEventsPath) },
			{ adjudicatorId: "ADJUDICATOR_CLAUDE", tool: "Claude Code", toolVersion: "2.1.228", requestedModel: "claude-opus-5", effectiveModels: effectiveClaudeModels, provider: "firstParty", exitCode: readExitCode(claudeExitPath), outputSha256: sha256(claudeResponsePath), toolUseObserved: false, rawEvidenceSha256: sha256(claudeRawPath), telemetrySha256: null },
		],
	};
}

function main(): void {
	const [, , preregistrationSha, rawManifestPath, preflightPath, promptPath, schemaPath, codexResponsePath, codexEventsPath, codexExitPath, claudeResponsePath, claudeRawPath, claudeExitPath, attestation, outputPath] = process.argv;
	if (!preregistrationSha || !rawManifestPath || !preflightPath || !promptPath || !schemaPath || !codexResponsePath || !codexEventsPath || !codexExitPath || !claudeResponsePath || !claudeRawPath || !claudeExitPath || attestation !== "ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN" || !outputPath) throw new Error("Usage: build-execution-metadata.ts <prereg-sha> <raw-prefreeze-manifest> <preflight> <prompt> <schema> <codex-response> <codex-events> <codex-exit> <claude-response> <claude-raw> <claude-exit> ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN <output>");
	writeFileSync(outputPath, `${JSON.stringify(buildExecutionMetadata(preregistrationSha, rawManifestPath, preflightPath, promptPath, schemaPath, codexResponsePath, codexEventsPath, codexExitPath, claudeResponsePath, claudeRawPath, claudeExitPath), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
