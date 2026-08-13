import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Condition = "A" | "B";

interface ArtifactEvidence {
	artifact: string;
	sha256: string;
}

interface CliVersionEvidence extends ArtifactEvidence {
	command: string;
	tool: "codex-cli" | "Claude Code";
	version: string;
}

export interface ExecutionPreflight {
	schemaVersion: 1;
	authorizedPreregistrationSha: string;
	actualHead: ArtifactEvidence;
	cleanStatus: ArtifactEvidence;
	promptSha256: Record<Condition, string>;
	responseSchemaSha256: Record<Condition, string>;
	cliVersions: {
		codex: CliVersionEvidence;
		claude: CliVersionEvidence;
	};
}

export const EXPECTED_PROMPT_SHA256: Record<Condition, string> = {
	A: "195cdf794aa2622f006e98dda49e9859a41b52d609996d3d10c22ee3c27b1357",
	B: "57ee2b3a0728fd1678fcdd8fcfe0b38f3b6c2b7ec09fbaf9a3e630648cf4a89e",
};
export const EXPECTED_RESPONSE_SCHEMA_SHA256: Record<Condition, string> = {
	A: "2d9cfaaff9402f16ef0d70c389386a68fddb63b300f416971b83d392bf16b616",
	B: "38d3a1d238637fedf867936013817772ea822a57d2e89516974347a96b1af36e",
};

const EXPECTED_VERSION_OUTPUT = {
	codex: "codex-cli 0.146.0\n",
	claude: "2.1.228 (Claude Code)\n",
} as const;

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} keys are not allowed`);
}

function sha256Bytes(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string): string {
	return sha256Bytes(readFileSync(path));
}

function run(command: string, args: string[], cwd: string, environment: NodeJS.ProcessEnv): string {
	const result = spawnSync(command, args, { cwd, encoding: "utf8", env: environment });
	assert(result.error === undefined, `${command} failed to start: ${result.error?.message ?? "unknown error"}`);
	assert(result.status === 0, `${command} ${args.join(" ")} exited ${result.status ?? "without a status"}`);
	assert(result.stderr === "", `${command} ${args.join(" ")} wrote to stderr`);
	return result.stdout;
}

function assertInside(parent: string, candidate: string, label: string): void {
	const fromParent = relative(resolve(parent), resolve(candidate));
	assert(fromParent !== "" && !fromParent.startsWith("..") && !isAbsolute(fromParent), `${label} must be inside ${parent}`);
}

function evidencePath(root: string, declaredPath: string): string {
	assert(!isAbsolute(declaredPath), "Preflight evidence paths must be relative");
	const rootPath = resolve(root);
	const candidate = resolve(rootPath, declaredPath);
	const fromRoot = relative(rootPath, candidate);
	assert(fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot), `Preflight evidence path escapes its root: ${declaredPath}`);
	return candidate;
}

function parseArtifact(value: unknown, expectedArtifact: string, label: string): ArtifactEvidence {
	assert(isRecord(value), `${label} is not an object`);
	assertExactKeys(value, ["artifact", "sha256"], label);
	assert(value.artifact === expectedArtifact, `${label} artifact path mismatch`);
	assert(typeof value.sha256 === "string" && /^[0-9a-f]{64}$/.test(value.sha256), `${label} hash is invalid`);
	return { artifact: value.artifact, sha256: value.sha256 };
}

function parseCliVersion(
	value: unknown,
	expected: { artifact: string; command: string; tool: CliVersionEvidence["tool"]; version: string },
	label: string,
): CliVersionEvidence {
	assert(isRecord(value), `${label} is not an object`);
	assertExactKeys(value, ["artifact", "sha256", "command", "tool", "version"], label);
	const artifact = parseArtifact({ artifact: value.artifact, sha256: value.sha256 }, expected.artifact, label);
	assert(value.command === expected.command, `${label} command mismatch`);
	assert(value.tool === expected.tool, `${label} tool mismatch`);
	assert(value.version === expected.version, `${label} version mismatch`);
	return { ...artifact, command: expected.command, tool: expected.tool, version: expected.version };
}

function readVerifiedArtifact(resultsRoot: string, evidence: ArtifactEvidence): string {
	const path = evidencePath(resultsRoot, evidence.artifact);
	assert(sha256File(path) === evidence.sha256, `Preflight evidence hash mismatch: ${evidence.artifact}`);
	return readFileSync(path, "utf8");
}

function actualInstrumentHashes(experimentRoot: string): {
	promptSha256: Record<Condition, string>;
	responseSchemaSha256: Record<Condition, string>;
} {
	return {
		promptSha256: {
			A: sha256File(join(experimentRoot, "prompts/condition-a.txt")),
			B: sha256File(join(experimentRoot, "prompts/condition-b.txt")),
		},
		responseSchemaSha256: {
			A: sha256File(join(experimentRoot, "schemas/condition-a-response.schema.json")),
			B: sha256File(join(experimentRoot, "schemas/condition-b-response.schema.json")),
		},
	};
}

function assertInstrumentHashes(
	actual: ReturnType<typeof actualInstrumentHashes>,
	expected: { promptSha256: Record<Condition, string>; responseSchemaSha256: Record<Condition, string> },
): void {
	for (const condition of ["A", "B"] as const) {
		assert(actual.promptSha256[condition] === EXPECTED_PROMPT_SHA256[condition], `Condition ${condition} prompt bytes differ from the preregistration`);
		assert(
			actual.responseSchemaSha256[condition] === EXPECTED_RESPONSE_SCHEMA_SHA256[condition],
			`Condition ${condition} response-schema bytes differ from the preregistration`,
		);
		assert(actual.promptSha256[condition] === expected.promptSha256[condition], `Condition ${condition} prompt differs from captured preflight evidence`);
		assert(
			actual.responseSchemaSha256[condition] === expected.responseSchemaSha256[condition],
			`Condition ${condition} response schema differs from captured preflight evidence`,
		);
	}
}

export function captureExecutionPreflight(
	authorizedPreregistrationSha: string,
	repositoryRoot: string,
	experimentRoot: string,
	resultsRawDirectory: string,
	environment: NodeJS.ProcessEnv = process.env,
): ExecutionPreflight {
	assert(/^[0-9a-f]{40}$/.test(authorizedPreregistrationSha), "Invalid authorized preregistration SHA");
	assertInside(repositoryRoot, experimentRoot, "Experiment root");
	assert(resolve(resultsRawDirectory) === resolve(experimentRoot, "results/raw"), "Preflight output must be the experiment results/raw directory");
	assert(!existsSync(resolve(experimentRoot, "results")), "Results directory already exists");

	const headOutput = run("git", ["rev-parse", "HEAD"], repositoryRoot, environment);
	const actualHead = headOutput.trim();
	assert(actualHead === authorizedPreregistrationSha, "Authorized preregistration SHA does not equal the actual HEAD");
	const statusOutput = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repositoryRoot, environment);
	assert(statusOutput.length === 0, "Execution must start from a clean worktree");

	const hashes = actualInstrumentHashes(experimentRoot);
	assertInstrumentHashes(hashes, hashes);
	const codexVersionOutput = run("codex", ["--version"], repositoryRoot, environment);
	const claudeVersionOutput = run("claude", ["--version"], repositoryRoot, environment);
	assert(codexVersionOutput === EXPECTED_VERSION_OUTPUT.codex, "Codex CLI version output differs from the preregistration");
	assert(claudeVersionOutput === EXPECTED_VERSION_OUTPUT.claude, "Claude Code version output differs from the preregistration");

	mkdirSync(resultsRawDirectory, { recursive: true });
	const headArtifact = "raw/git-head.txt";
	const statusArtifact = "raw/git-status-porcelain-v1-z.txt";
	const codexArtifact = "raw/codex-version.txt";
	const claudeArtifact = "raw/claude-version.txt";
	writeFileSync(join(resultsRawDirectory, "git-head.txt"), headOutput);
	writeFileSync(join(resultsRawDirectory, "git-status-porcelain-v1-z.txt"), statusOutput);
	writeFileSync(join(resultsRawDirectory, "codex-version.txt"), codexVersionOutput);
	writeFileSync(join(resultsRawDirectory, "claude-version.txt"), claudeVersionOutput);

	const preflight: ExecutionPreflight = {
		schemaVersion: 1,
		authorizedPreregistrationSha,
		actualHead: { artifact: headArtifact, sha256: sha256Bytes(headOutput) },
		cleanStatus: { artifact: statusArtifact, sha256: sha256Bytes(statusOutput) },
		promptSha256: hashes.promptSha256,
		responseSchemaSha256: hashes.responseSchemaSha256,
		cliVersions: {
			codex: {
				artifact: codexArtifact,
				sha256: sha256Bytes(codexVersionOutput),
				command: "codex --version",
				tool: "codex-cli",
				version: "0.146.0",
			},
			claude: {
				artifact: claudeArtifact,
				sha256: sha256Bytes(claudeVersionOutput),
				command: "claude --version",
				tool: "Claude Code",
				version: "2.1.228",
			},
		},
	};
	writeFileSync(join(resultsRawDirectory, "execution-preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`);
	return preflight;
}

export function readAndValidateExecutionPreflight(
	preflightPath: string,
	resultsRoot: string,
	experimentRoot: string,
	authorizedPreregistrationSha: string,
): ExecutionPreflight {
	const raw = readFileSync(preflightPath, "utf8");
	const value = JSON.parse(raw) as unknown;
	assert(isRecord(value), "Execution preflight is not an object");
	assertExactKeys(
		value,
		["schemaVersion", "authorizedPreregistrationSha", "actualHead", "cleanStatus", "promptSha256", "responseSchemaSha256", "cliVersions"],
		"Execution preflight",
	);
	assert(value.schemaVersion === 1, "Unsupported execution-preflight version");
	assert(value.authorizedPreregistrationSha === authorizedPreregistrationSha, "Preflight authorization SHA mismatch");
	const actualHead = parseArtifact(value.actualHead, "raw/git-head.txt", "Actual-HEAD evidence");
	const cleanStatus = parseArtifact(value.cleanStatus, "raw/git-status-porcelain-v1-z.txt", "Clean-status evidence");
	assert(isRecord(value.promptSha256), "Preflight prompt hashes are invalid");
	assertExactKeys(value.promptSha256, ["A", "B"], "Preflight prompt hashes");
	assert(isRecord(value.responseSchemaSha256), "Preflight response-schema hashes are invalid");
	assertExactKeys(value.responseSchemaSha256, ["A", "B"], "Preflight response-schema hashes");
	for (const condition of ["A", "B"] as const) {
		assert(typeof value.promptSha256[condition] === "string", `Condition ${condition} preflight prompt hash is invalid`);
		assert(typeof value.responseSchemaSha256[condition] === "string", `Condition ${condition} preflight schema hash is invalid`);
	}
	assert(isRecord(value.cliVersions), "Preflight CLI versions are invalid");
	assertExactKeys(value.cliVersions, ["codex", "claude"], "Preflight CLI versions");
	const codex = parseCliVersion(
		value.cliVersions.codex,
		{ artifact: "raw/codex-version.txt", command: "codex --version", tool: "codex-cli", version: "0.146.0" },
		"Codex version evidence",
	);
	const claude = parseCliVersion(
		value.cliVersions.claude,
		{ artifact: "raw/claude-version.txt", command: "claude --version", tool: "Claude Code", version: "2.1.228" },
		"Claude version evidence",
	);

	assert(readVerifiedArtifact(resultsRoot, actualHead) === `${authorizedPreregistrationSha}\n`, "Captured actual HEAD does not equal the authorization SHA");
	assert(readVerifiedArtifact(resultsRoot, cleanStatus) === "", "Captured worktree status is not clean");
	assert(readVerifiedArtifact(resultsRoot, codex) === EXPECTED_VERSION_OUTPUT.codex, "Captured Codex version output mismatch");
	assert(readVerifiedArtifact(resultsRoot, claude) === EXPECTED_VERSION_OUTPUT.claude, "Captured Claude version output mismatch");
	const capturedHashes = {
		promptSha256: { A: value.promptSha256.A, B: value.promptSha256.B } as Record<Condition, string>,
		responseSchemaSha256: { A: value.responseSchemaSha256.A, B: value.responseSchemaSha256.B } as Record<Condition, string>,
	};
	assertInstrumentHashes(actualInstrumentHashes(experimentRoot), capturedHashes);
	return {
		schemaVersion: 1,
		authorizedPreregistrationSha,
		actualHead,
		cleanStatus,
		promptSha256: capturedHashes.promptSha256,
		responseSchemaSha256: capturedHashes.responseSchemaSha256,
		cliVersions: { codex, claude },
	};
}

export function assertExecutionWorktree(
	repositoryRoot: string,
	experimentRoot: string,
	authorizedPreregistrationSha: string,
	environment: NodeJS.ProcessEnv = process.env,
): void {
	const actualHead = run("git", ["rev-parse", "HEAD"], repositoryRoot, environment).trim();
	assert(actualHead === authorizedPreregistrationSha, "Actual HEAD changed after execution preflight");
	const status = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repositoryRoot, environment);
	const resultsPrefix = `${relative(resolve(repositoryRoot), resolve(experimentRoot, "results")).split("\\").join("/")}/`;
	for (const entry of status.split("\0").filter((value) => value.length > 0)) {
		assert(entry.startsWith("?? "), `Tracked worktree change appeared after execution preflight: ${entry.slice(3)}`);
		assert(entry.slice(3).split("\\").join("/").startsWith(resultsPrefix), `Unrelated untracked file appeared after execution preflight: ${entry.slice(3)}`);
	}
}

function main(): void {
	const [, , authorizedPreregistrationSha, repositoryRoot, experimentRoot, resultsRawDirectory] = process.argv;
	if (!authorizedPreregistrationSha || !repositoryRoot || !experimentRoot || !resultsRawDirectory) {
		throw new Error(
			"Usage: execution-preflight.ts <authorized-preregistration-sha> <repository-root> <experiment-root> <results-raw-directory>",
		);
	}
	captureExecutionPreflight(authorizedPreregistrationSha, repositoryRoot, experimentRoot, resultsRawDirectory);
	process.stdout.write("EXECUTION_PREFLIGHT_CAPTURED\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
