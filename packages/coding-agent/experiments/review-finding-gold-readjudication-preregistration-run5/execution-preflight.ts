import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assert } from "./adjudication-lib.js";

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function command(command: string, args: string[], cwd: string): string {
	return execFileSync(command, args, { cwd, encoding: "utf8" });
}

export function runExecutionPreflight(preregistrationSha: string, repositoryRoot: string, experimentRoot: string, rawOutputRoot: string): Record<string, unknown> {
	assert(/^[0-9a-f]{40}$/.test(preregistrationSha), "Invalid preregistration SHA");
	const repository = resolve(repositoryRoot);
	const experiment = resolve(experimentRoot);
	const resultsRoot = resolve(rawOutputRoot, "..");
	assert(!existsSync(resultsRoot), "Results directory already exists");
	const head = command("git", ["rev-parse", "HEAD"], repository).trim();
	assert(head === preregistrationSha, "HEAD does not match authorized preregistration SHA");
	const status = command("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repository);
	assert(status.length === 0, "Execution worktree is not clean");
	const protocol = JSON.parse(readFileSync(join(experiment, "protocol.json"), "utf8")) as unknown;
	assert(typeof protocol === "object" && protocol !== null && !Array.isArray(protocol), "Invalid protocol");
	const artifacts = (protocol as Record<string, unknown>).frozenArtifacts;
	assert(typeof artifacts === "object" && artifacts !== null && !Array.isArray(artifacts), "Protocol artifact hashes missing");
	const frozenArtifacts = artifacts as Record<string, unknown>;
	assert(frozenArtifacts["prompts/adjudication.txt"] === sha256(join(experiment, "prompts/adjudication.txt")), "Prompt bytes changed");
	assert(frozenArtifacts["schemas/adjudication-response.schema.json"] === sha256(join(experiment, "schemas/adjudication-response.schema.json")), "Response schema bytes changed");
	const codexVersion = command("codex", ["--version"], repository);
	const claudeVersion = command("claude", ["--version"], repository);
	assert(codexVersion === "codex-cli 0.146.0\n", "Codex CLI version mismatch");
	assert(claudeVersion === "2.1.228 (Claude Code)\n", "Claude Code version mismatch");
	mkdirSync(rawOutputRoot, { recursive: true });
	writeFileSync(join(rawOutputRoot, "git-head.txt"), `${head}\n`);
	writeFileSync(join(rawOutputRoot, "git-status-porcelain-v1-z.txt"), status);
	writeFileSync(join(rawOutputRoot, "codex-version.txt"), codexVersion);
	writeFileSync(join(rawOutputRoot, "claude-version.txt"), claudeVersion);
	const record = {
		schemaVersion: 1,
		authorizedPreregistrationSha: preregistrationSha,
		sourceEvidenceSha: "f1450e95a197b91998550566e36484f046a2a8ed",
		headSha256: sha256(join(rawOutputRoot, "git-head.txt")),
		cleanStatusSha256: sha256(join(rawOutputRoot, "git-status-porcelain-v1-z.txt")),
		codexVersionSha256: sha256(join(rawOutputRoot, "codex-version.txt")),
		claudeVersionSha256: sha256(join(rawOutputRoot, "claude-version.txt")),
		promptSha256: sha256(join(experiment, "prompts/adjudication.txt")),
		responseSchemaSha256: sha256(join(experiment, "schemas/adjudication-response.schema.json")),
	};
	writeFileSync(join(rawOutputRoot, "execution-preflight.json"), `${JSON.stringify(record, null, 2)}\n`);
	return record;
}

function main(): void {
	const [, , preregistrationSha, repositoryRoot, experimentRoot, rawOutputRoot] = process.argv;
	if (!preregistrationSha || !repositoryRoot || !experimentRoot || !rawOutputRoot) throw new Error("Usage: execution-preflight.ts <preregistration-sha> <repository-root> <experiment-root> <raw-output-root>");
	runExecutionPreflight(preregistrationSha, repositoryRoot, experimentRoot, rawOutputRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
