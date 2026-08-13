import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodexEvents } from "./evaluate.js";
import { captureExecutionPreflight, readAndValidateExecutionPreflight } from "./execution-preflight.js";

interface Fixture {
	root: string;
	repositoryRoot: string;
	experimentRoot: string;
	rawRoot: string;
	head: string;
	environment: NodeJS.ProcessEnv;
}

const temporaryRoots: string[] = [];
const sourceExperimentRoot = resolve(import.meta.dirname);

function command(commandName: string, args: string[], cwd: string): string {
	return execFileSync(commandName, args, { cwd, encoding: "utf8" });
}

function writeExecutable(path: string, output: string): void {
	writeFileSync(path, `#!/bin/sh\nprintf '%s' '${output}'\n`);
	chmodSync(path, 0o755);
}

function createFixture(overrides: { codexVersion?: string; claudeVersion?: string } = {}): Fixture {
	const root = mkdtempSync(join(tmpdir(), "run4-execution-evidence-"));
	temporaryRoots.push(root);
	const repositoryRoot = join(root, "repository");
	const experimentRoot = join(repositoryRoot, "experiment");
	const binRoot = join(root, "bin");
	mkdirSync(join(experimentRoot, "prompts"), { recursive: true });
	mkdirSync(join(experimentRoot, "schemas"), { recursive: true });
	mkdirSync(binRoot, { recursive: true });
	for (const condition of ["a", "b"] as const) {
		copyFileSync(join(sourceExperimentRoot, `prompts/condition-${condition}.txt`), join(experimentRoot, `prompts/condition-${condition}.txt`));
		copyFileSync(
			join(sourceExperimentRoot, `schemas/condition-${condition}-response.schema.json`),
			join(experimentRoot, `schemas/condition-${condition}-response.schema.json`),
		);
	}
	writeExecutable(join(binRoot, "codex"), overrides.codexVersion ?? "codex-cli 0.146.0\n");
	writeExecutable(join(binRoot, "claude"), overrides.claudeVersion ?? "2.1.228 (Claude Code)\n");
	command("git", ["init", "-q"], repositoryRoot);
	command("git", ["config", "user.name", "Execution Evidence Test"], repositoryRoot);
	command("git", ["config", "user.email", "execution-evidence@example.invalid"], repositoryRoot);
	command("git", ["add", "experiment"], repositoryRoot);
	command("git", ["commit", "-q", "-m", "fixture"], repositoryRoot);
	return {
		root,
		repositoryRoot,
		experimentRoot,
		rawRoot: join(experimentRoot, "results/raw"),
		head: command("git", ["rev-parse", "HEAD"], repositoryRoot).trim(),
		environment: { ...process.env, PATH: `${binRoot}:${process.env.PATH ?? ""}` },
	};
}

function commitFixture(fixture: Fixture, message: string): string {
	command("git", ["add", "experiment"], fixture.repositoryRoot);
	command("git", ["commit", "-q", "-m", message], fixture.repositoryRoot);
	return command("git", ["rev-parse", "HEAD"], fixture.repositoryRoot).trim();
}

function validCodexEvents(): string {
	return [
		JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
		JSON.stringify({ type: "turn.started" }),
		JSON.stringify({ type: "item.completed", item: { id: "item-1", type: "reasoning", text: "checked" } }),
		JSON.stringify({ type: "item.completed", item: { id: "item-2", type: "agent_message", text: "{}" } }),
		JSON.stringify({
			type: "turn.completed",
			usage: {
				input_tokens: 10,
				cached_input_tokens: 2,
				cache_write_input_tokens: 0,
				output_tokens: 3,
				reasoning_output_tokens: 1,
			},
		}),
		"",
	].join("\n");
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("execution preflight evidence binding", () => {
	it("captures the authorized clean HEAD, actual instrument bytes, and raw CLI-version outputs", () => {
		const fixture = createFixture();
		const preflight = captureExecutionPreflight(
			fixture.head,
			fixture.repositoryRoot,
			fixture.experimentRoot,
			fixture.rawRoot,
			fixture.environment,
		);
		expect(readFileSync(join(fixture.rawRoot, "git-head.txt"), "utf8")).toBe(`${fixture.head}\n`);
		expect(readFileSync(join(fixture.rawRoot, "git-status-porcelain-v1-z.txt"), "utf8")).toBe("");
		expect(readFileSync(join(fixture.rawRoot, "codex-version.txt"), "utf8")).toBe("codex-cli 0.146.0\n");
		expect(preflight.authorizedPreregistrationSha).toBe(fixture.head);
		expect(() =>
			readAndValidateExecutionPreflight(
				join(fixture.rawRoot, "execution-preflight.json"),
				dirname(fixture.rawRoot),
				fixture.experimentRoot,
				fixture.head,
			),
		).not.toThrow();
	});

	it("rejects an authorization SHA that is not the actual HEAD", () => {
		const fixture = createFixture();
		expect(() =>
			captureExecutionPreflight("0".repeat(40), fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment),
		).toThrow("does not equal the actual HEAD");
	});

	it("rejects a dirty execution worktree", () => {
		const fixture = createFixture();
		writeFileSync(join(fixture.repositoryRoot, "untracked.txt"), "dirty\n");
		expect(() =>
			captureExecutionPreflight(fixture.head, fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment),
		).toThrow("clean worktree");
	});

	it("rejects changed prompt bytes even from a clean authorized HEAD", () => {
		const fixture = createFixture();
		writeFileSync(join(fixture.experimentRoot, "prompts/condition-a.txt"), "changed prompt\n");
		const changedHead = commitFixture(fixture, "change prompt");
		expect(() =>
			captureExecutionPreflight(changedHead, fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment),
		).toThrow("prompt bytes differ");
	});

	it("rejects changed response-schema bytes even from a clean authorized HEAD", () => {
		const fixture = createFixture();
		writeFileSync(join(fixture.experimentRoot, "schemas/condition-b-response.schema.json"), "{}\n");
		const changedHead = commitFixture(fixture, "change schema");
		expect(() =>
			captureExecutionPreflight(changedHead, fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment),
		).toThrow("response-schema bytes differ");
	});

	it("rejects CLI-version output outside the preregistered identity", () => {
		const fixture = createFixture({ codexVersion: "codex-cli 0.147.0\n" });
		expect(() =>
			captureExecutionPreflight(fixture.head, fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment),
		).toThrow("Codex CLI version output differs");
	});

	it("rejects post-capture alteration of version evidence", () => {
		const fixture = createFixture();
		captureExecutionPreflight(fixture.head, fixture.repositoryRoot, fixture.experimentRoot, fixture.rawRoot, fixture.environment);
		writeFileSync(join(fixture.rawRoot, "claude-version.txt"), "tampered\n");
		expect(() =>
			readAndValidateExecutionPreflight(
				join(fixture.rawRoot, "execution-preflight.json"),
				dirname(fixture.rawRoot),
				fixture.experimentRoot,
				fixture.head,
			),
		).toThrow("evidence hash mismatch");
	});
});

describe("closed-world Codex event evidence", () => {
	it("accepts only the preregistered no-tool successful event sequence", () => {
		expect(parseCodexEvents(validCodexEvents())).toEqual({ inputTokens: 10, outputTokens: 3, agentMessage: "{}" });
	});

	it("rejects an unrecognized top-level event type", () => {
		const events = validCodexEvents().replace('"type":"item.completed"', '"type":"item.started"');
		expect(() => parseCodexEvents(events)).toThrow("unrecognized type");
	});

	it("rejects an unrecognized completed-item type", () => {
		const events = validCodexEvents().replace('"type":"reasoning"', '"type":"command_execution"');
		expect(() => parseCodexEvents(events)).toThrow("item type is not allowed");
	});

	it("rejects unrecognized nested event fields", () => {
		const events = validCodexEvents().replace('"text":"checked"', '"text":"checked","command":"pwd"');
		expect(() => parseCodexEvents(events)).toThrow("unrecognized fields");
	});

	it("rejects failed or incomplete event sequences", () => {
		const failed = validCodexEvents().replace('"type":"turn.completed"', '"type":"turn.failed"');
		expect(() => parseCodexEvents(failed)).toThrow("must end with turn.completed");
	});
});
