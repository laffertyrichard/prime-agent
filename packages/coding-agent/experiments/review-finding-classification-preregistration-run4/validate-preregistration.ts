import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface Protocol {
	schemaVersion: number;
	phase: string;
	source: { sha: string; blindCorpusSha256: string; goldPairsSha256: string; corpusVersion: string };
	executionBoundary: { classificationAuthorized: boolean; modelApiInvocationCount: number; classificationOutputCount: number };
	artifacts: Record<string, string>;
}

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseJson(path: string): Record<string, unknown> {
	const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
	assert(typeof value === "object" && value !== null && !Array.isArray(value), `Expected object in ${path}`);
	return value as Record<string, unknown>;
}

export function validatePreregistration(experimentRoot: string, repositoryRoot: string): void {
	const protocol = JSON.parse(readFileSync(join(experimentRoot, "protocol.json"), "utf8")) as Protocol;
	assert(protocol.schemaVersion === 1 && protocol.phase === "PREREGISTRATION_COMPLETE_AWAITING_REVIEW", "Protocol is not complete for review");
	assert(protocol.source.sha === "bd247656aeeabea6b347bc892c0bfb9236fd7663", "Source SHA mismatch");
	assert(protocol.source.corpusVersion === "frozen-1", "Corpus version mismatch");
	assert(protocol.source.blindCorpusSha256 === "b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b", "Blind hash mismatch");
	assert(protocol.source.goldPairsSha256 === "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b", "Gold hash mismatch");
	assert(!protocol.executionBoundary.classificationAuthorized, "Classification must remain unauthorized");
	assert(protocol.executionBoundary.modelApiInvocationCount === 0, "Model/API invocation count must be zero");
	assert(protocol.executionBoundary.classificationOutputCount === 0, "Classification output count must be zero");
	assert(!existsSync(join(experimentRoot, "results")), "Preregistration must not contain results");

	for (const [relativePath, expectedHash] of Object.entries(protocol.artifacts)) {
		assert(sha256(join(experimentRoot, relativePath)) === expectedHash, `Artifact hash mismatch: ${relativePath}`);
	}

	const run3Root = join(repositoryRoot, "packages/coding-agent/experiments/review-finding-corpus-validation-run3/frozen");
	const blindPath = join(run3Root, "blind-corpus.json");
	const goldPath = join(run3Root, "gold-pairs.json");
	assert(sha256(blindPath) === protocol.source.blindCorpusSha256, "Pinned blind corpus bytes changed");
	assert(sha256(goldPath) === protocol.source.goldPairsSha256, "Pinned gold bytes changed");
	const blindText = readFileSync(blindPath, "utf8").trimEnd();
	const gold = parseJson(goldPath);
	assert(Array.isArray(gold.pairs), "Gold pairs are missing");
	const publicPairs = gold.pairs.map((value) => {
		assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid gold pair");
		const pair = value as Record<string, unknown>;
		assert(typeof pair.pairId === "string" && typeof pair.leftItemId === "string" && typeof pair.rightItemId === "string", "Invalid pair identity");
		return { pairId: pair.pairId, leftItemId: pair.leftItemId, rightItemId: pair.rightItemId };
	});
	const conditionA = readFileSync(join(experimentRoot, "prompts/condition-a.txt"), "utf8");
	const conditionB = readFileSync(join(experimentRoot, "prompts/condition-b.txt"), "utf8");
	assert(conditionA.endsWith(`BLIND CORPUS\n${blindText}\n`), "Condition A does not embed the pinned blind corpus exactly");
	assert(
		conditionB.includes(`DESIGNATED PAIRS — GOLD RELATIONS WITHHELD\n${JSON.stringify(publicPairs, null, 2)}\n\nBLIND CORPUS\n${blindText}\n`),
		"Condition B public-pair or blind-corpus bytes differ",
	);
	assert(!/\bF[0-9]{2}\b/.test(conditionA + conditionB), "Obsolete Run 2 finding IDs leaked into prompts");

	const blind = parseJson(blindPath);
	assert(Array.isArray(blind.items) && blind.items.length === 22, "Blind item count mismatch");
	const itemIds = blind.items.map((value) => {
		assert(typeof value === "object" && value !== null && !Array.isArray(value), "Invalid blind item");
		const item = value as Record<string, unknown>;
		assert(typeof item.itemId === "string", "Blind item ID is missing");
		return item.itemId;
	});
	const schemaA = parseJson(join(experimentRoot, "schemas/condition-a-response.schema.json"));
	const schemaB = parseJson(join(experimentRoot, "schemas/condition-b-response.schema.json"));
	const aProperties = schemaA.properties as Record<string, unknown>;
	const bProperties = schemaB.properties as Record<string, unknown>;
	const aClassifications = (aProperties.classifications as Record<string, unknown>);
	const bClassifications = (bProperties.classifications as Record<string, unknown>);
	assert(aClassifications.minItems === 22 && aClassifications.maxItems === 22, "Condition A schema count mismatch");
	assert(bClassifications.minItems === 22 && bClassifications.maxItems === 22, "Condition B item count mismatch");
	const bPairs = bProperties.pairs as Record<string, unknown>;
	assert(bPairs.minItems === 16 && bPairs.maxItems === 16, "Condition B pair count mismatch");
	const aItemProperties = ((aClassifications.items as Record<string, unknown>).properties as Record<string, unknown>);
	const aItemId = aItemProperties.itemId as Record<string, unknown>;
	assert(JSON.stringify(aItemId.enum) === JSON.stringify(itemIds), "Condition A item enum mismatch");

	const manifestLines = readFileSync(join(experimentRoot, "preregistration-manifest.sha256"), "utf8").trim().split("\n");
	for (const line of manifestLines) {
		const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
		assert(match !== null, `Invalid manifest line: ${line}`);
		assert(sha256(join(experimentRoot, match[2])) === match[1], `Manifest mismatch: ${match[2]}`);
	}
}

function main(): void {
	const [, , experimentRoot, repositoryRoot] = process.argv;
	if (!experimentRoot || !repositoryRoot) throw new Error("Usage: validate-preregistration.ts <experiment-root> <repository-root>");
	validatePreregistration(experimentRoot, repositoryRoot);
	process.stdout.write("PREREGISTRATION_VALID\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
