import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { assert, isRecord } from "./adjudication-lib.js";

export function extractClaudeResponse(rawPath: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(rawPath, "utf8")) as unknown;
	assert(isRecord(parsed), "Claude envelope must be an object");
	assert(parsed.is_error === false, "Claude invocation reported an error");
	assert(Array.isArray(parsed.permission_denials) && parsed.permission_denials.length === 0, "Claude permission denial or tool attempt observed");
	assert(isRecord(parsed.structured_output), "Claude structured_output is missing");
	return parsed.structured_output;
}

function main(): void {
	const [, , rawPath, outputPath] = process.argv;
	if (!rawPath || !outputPath) throw new Error("Usage: extract-claude-response.ts <raw-envelope> <output>");
	writeFileSync(outputPath, `${JSON.stringify(extractClaudeResponse(rawPath), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
