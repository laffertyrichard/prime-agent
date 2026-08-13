import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assert, assertExactKeys, isRecord } from "./adjudication-lib.js";

const SOURCE_EVIDENCE_SHA = "f1450e95a197b91998550566e36484f046a2a8ed";
const BLIND_SHA256 = "b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b";
const GOLD_SHA256 = "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b";
const RUN_A_HASHES = {
	"results/normalized-results.json": "18d38a44c9007e12dee51bd1e55ed63e1f9a2e1dec777c8a07a55217ce47fb9a",
	"results/metrics.json": "9a5935b591bd758456ecc4e3bd379303cda78c8ac7a522f9cac041d0b62b23de",
	"results/execution-metadata.json": "86bdd497ddc6c6df848e92315abf4b87dbd876826065cc6b3e3d09bd626a9ac5",
	"results/run-a-evidence-manifest.sha256": "a3e2dde507f52902d118f25c20838b1e3ff4c0bc172afe21c98a7060b7b0bfdd",
};

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readObject(path: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	assert(isRecord(parsed), `Expected object in ${path}`);
	return parsed;
}

function assertNoForbiddenKey(value: unknown, path: string): void {
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) assertNoForbiddenKey(entry, `${path}[${index}]`);
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, entry] of Object.entries(value)) {
		assert(key !== "relation" && key !== "adjudicationRationale", `Forbidden answer key in ${path}.${key}`);
		assertNoForbiddenKey(entry, `${path}.${key}`);
	}
}

function validateManifest(root: string, manifestName: string, expectedPaths?: string[]): string[] {
	const lines = readFileSync(join(root, manifestName), "utf8").trim().split("\n");
	const paths = lines.map((line) => {
		const match = /^([0-9a-f]{64})  ([^/].*)$/.exec(line);
		assert(match !== null && !match[2].split("/").includes(".."), `Invalid manifest line: ${line}`);
		assert(sha256(join(root, match[2])) === match[1], `Manifest mismatch: ${match[2]}`);
		return match[2];
	});
	assert(new Set(paths).size === paths.length, `Duplicate path in ${manifestName}`);
	if (expectedPaths) assert(JSON.stringify(paths) === JSON.stringify(expectedPaths), `${manifestName} allowlist mismatch`);
	return paths;
}

function listFiles(root: string, prefix = ""): string[] {
	return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		return entry.isDirectory() ? listFiles(root, relativePath) : [relativePath];
	}).sort();
}

export function validatePreregistration(experimentRoot: string, repositoryRoot: string): void {
	const protocol = readObject(join(experimentRoot, "protocol.json"));
	assert(protocol.schemaVersion === 1 && protocol.phase === "PREREGISTRATION_COMPLETE_AWAITING_REVIEW", "Protocol is not complete for review");
	assert(isRecord(protocol.source) && protocol.source.evidenceSha === SOURCE_EVIDENCE_SHA, "Evidence SHA mismatch");
	assert(isRecord(protocol.executionBoundary), "Execution boundary is missing");
	for (const key of ["humanAdjudicationAuthorized", "modelAdjudicationAuthorized", "modelApiInvocationAuthorized", "corpusRelabelingAuthorized", "runBExecutionAuthorized", "resultGenerationAuthorized", "promptTuningAuthorized", "pushAuthorized", "mergeAuthorized", "prAuthorized", "publicationAuthorized"]) {
		assert(protocol.executionBoundary[key] === false, `${key} must remain false`);
	}
	for (const key of ["humanAdjudicationCount", "modelAdjudicationCount", "modelApiInvocationCount", "adjudicationOutputCount", "blindFinalCount", "goldComparisonCount", "corpusRelabelCount", "runBInvocationCount"]) {
		assert(protocol.executionBoundary[key] === 0, `${key} must remain zero`);
	}
	assert(!existsSync(join(experimentRoot, "results")), "Preregistration must not contain results");

	const run3Root = join(repositoryRoot, "packages/coding-agent/experiments/review-finding-corpus-validation-run3/frozen");
	const run4Root = join(repositoryRoot, "packages/coding-agent/experiments/review-finding-classification-preregistration-run4");
	const blindPath = join(run3Root, "blind-corpus.json");
	const goldPath = join(run3Root, "gold-pairs.json");
	assert(sha256(blindPath) === BLIND_SHA256 && sha256(goldPath) === GOLD_SHA256, "Protected Run 3 corpus bytes changed");
	for (const [relativePath, expectedHash] of Object.entries(RUN_A_HASHES)) assert(sha256(join(run4Root, relativePath)) === expectedHash, `Protected Run A bytes changed: ${relativePath}`);

	const blind = readObject(blindPath);
	const gold = readObject(goldPath);
	assert(Array.isArray(blind.items) && blind.items.length === 22 && Array.isArray(gold.pairs) && gold.pairs.length === 16, "Protected source counts changed");
	const manifestations = new Map<string, string>();
	for (const [index, entry] of blind.items.entries()) {
		assert(isRecord(entry) && typeof entry.itemId === "string" && typeof entry.manifestation === "string", `Invalid protected blind item ${index}`);
		manifestations.set(entry.itemId, entry.manifestation);
	}
	const sourcePairs = gold.pairs.map((entry, index) => {
		assert(isRecord(entry) && typeof entry.pairId === "string" && typeof entry.leftItemId === "string" && typeof entry.rightItemId === "string" && typeof entry.adjudicationRationale === "string", `Invalid protected gold pair ${index}`);
		return entry;
	});

	const packet = readObject(join(experimentRoot, "blind-packet.json"));
	const caseMap = readObject(join(experimentRoot, "sealed/case-map.json"));
	assertExactKeys(packet, ["schemaVersion", "packetVersion", "caseCount", "cases"], "blind packet");
	assertExactKeys(caseMap, ["schemaVersion", "mappingVersion", "sourceEvidenceSha", "constructionSaltHex", "constructionMethod", "caseCount", "cases"], "case map");
	assert(packet.schemaVersion === 1 && packet.caseCount === 16 && Array.isArray(packet.cases) && packet.cases.length === 16, "Blind packet count mismatch");
	assert(caseMap.schemaVersion === 1 && caseMap.sourceEvidenceSha === SOURCE_EVIDENCE_SHA && caseMap.caseCount === 16 && Array.isArray(caseMap.cases) && caseMap.cases.length === 16, "Case map count mismatch");
	assert(typeof caseMap.constructionSaltHex === "string" && /^[0-9a-f]{64}$/.test(caseMap.constructionSaltHex), "Invalid sealed construction salt");
	assertNoForbiddenKey(caseMap, "caseMap");
	const salt = Buffer.from(caseMap.constructionSaltHex, "hex");
	const sourceByPair = new Map(sourcePairs.map((pair) => [pair.pairId as string, pair]));
	const expectedOrder = [...sourcePairs].sort((left, right) => createHmac("sha256", salt).update(left.pairId as string).digest("hex").localeCompare(createHmac("sha256", salt).update(right.pairId as string).digest("hex")));
	const mappedPairIds: string[] = [];
	for (const [index, mapping] of caseMap.cases.entries()) {
		assert(isRecord(mapping), `Invalid case mapping ${index}`);
		assertExactKeys(mapping, ["caseId", "sourcePairId", "manifestationAItemId", "manifestationBItemId"], `case mapping ${index}`);
		assert(typeof mapping.caseId === "string" && typeof mapping.sourcePairId === "string" && typeof mapping.manifestationAItemId === "string" && typeof mapping.manifestationBItemId === "string", `Invalid case mapping ${index}`);
		const source = sourceByPair.get(mapping.sourcePairId);
		assert(source !== undefined && expectedOrder[index].pairId === mapping.sourcePairId, `Case mapping is incomplete or order-biased at ${index}`);
		const digest = createHmac("sha256", salt).update(mapping.sourcePairId).digest("hex");
		assert(mapping.caseId === `case-${digest.slice(0, 32)}`, `Case alias mismatch at ${index}`);
		const swap = Number.parseInt(digest.slice(-1), 16) % 2 === 1;
		const expectedItems = swap ? [source.rightItemId, source.leftItemId] : [source.leftItemId, source.rightItemId];
		assert(mapping.manifestationAItemId === expectedItems[0] && mapping.manifestationBItemId === expectedItems[1], `Case orientation mismatch at ${index}`);
		const publicCase = packet.cases[index];
		assert(isRecord(publicCase), `Invalid public case ${index}`);
		assertExactKeys(publicCase, ["caseId", "manifestationA", "manifestationB"], `public case ${index}`);
		assert(publicCase.caseId === mapping.caseId && publicCase.manifestationA === manifestations.get(mapping.manifestationAItemId) && publicCase.manifestationB === manifestations.get(mapping.manifestationBItemId), `Public case projection mismatch at ${index}`);
		mappedPairIds.push(mapping.sourcePairId);
	}
	assert(new Set(mappedPairIds).size === 16 && mappedPairIds.every((pairId) => sourceByPair.has(pairId)), "Case map is not a bijection over all 16 pairs");

	const publicText = `${readFileSync(join(experimentRoot, "blind-packet.json"), "utf8")}\n${readFileSync(join(experimentRoot, "prompts/adjudication.txt"), "utf8")}\n${readFileSync(join(experimentRoot, "schemas/adjudication-response.schema.json"), "utf8")}`;
	assert(!/\b(?:pair|item)-[0-9a-f]+\b/.test(publicText), "Original pair or item identity leaked to adjudicators");
	assert(!publicText.includes(SOURCE_EVIDENCE_SHA) && !publicText.includes("CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED"), "Prior experiment identity or conclusion leaked");
	for (const pair of sourcePairs) assert(!publicText.includes(pair.adjudicationRationale as string), `Original rationale leaked: ${pair.pairId as string}`);
	const packetText = readFileSync(join(experimentRoot, "blind-packet.json"), "utf8").trimEnd();
	assert(readFileSync(join(experimentRoot, "prompts/adjudication.txt"), "utf8").endsWith(`BLIND PACKET\n${packetText}\n`), "Prompt does not embed the exact blind packet");
	const responseSchema = readObject(join(experimentRoot, "schemas/adjudication-response.schema.json"));
	assert(isRecord(responseSchema.properties), "Response schema properties missing");
	const adjudications = responseSchema.properties.adjudications;
	assert(isRecord(adjudications) && adjudications.minItems === 16 && adjudications.maxItems === 16 && isRecord(adjudications.items) && isRecord(adjudications.items.properties), "Response schema count mismatch");
	const schemaCaseId = adjudications.items.properties.caseId;
	assert(isRecord(schemaCaseId) && JSON.stringify(schemaCaseId.enum) === JSON.stringify(packet.cases.map((entry) => (entry as Record<string, unknown>).caseId)), "Response schema case enum mismatch");

	const blindEvaluatorSource = readFileSync(join(experimentRoot, "adjudicate-blind.ts"), "utf8").toLowerCase();
	for (const forbidden of ["gold-pairs", "case-map", "normalized-results", "metrics.json", "comparison.schema"]) assert(!blindEvaluatorSource.includes(forbidden), `Blind finalizer crosses boundary: ${forbidden}`);
	assert(isRecord(protocol.frozenArtifacts), "Protocol artifact hash map missing");
	for (const [relativePath, expectedHash] of Object.entries(protocol.frozenArtifacts)) {
		assert(typeof expectedHash === "string" && sha256(join(experimentRoot, relativePath)) === expectedHash, `Frozen artifact mismatch: ${relativePath}`);
	}
	validateManifest(experimentRoot, "adjudicator-packet-manifest.sha256", ["prompts/adjudication.txt", "schemas/adjudication-response.schema.json"]);
	const preregisteredPaths = validateManifest(experimentRoot, "preregistration-manifest.sha256");
	const actualManifestablePaths = listFiles(experimentRoot).filter((relativePath) => relativePath !== "preregistration-manifest.sha256");
	assert(JSON.stringify(preregisteredPaths) === JSON.stringify(actualManifestablePaths), "Preregistration manifest does not cover every file exactly once");
	const expectedFrozenArtifacts = actualManifestablePaths.filter((relativePath) => relativePath !== "protocol.json" && relativePath !== "adjudicator-packet-manifest.sha256");
	assert(JSON.stringify(Object.keys(protocol.frozenArtifacts).sort()) === JSON.stringify(expectedFrozenArtifacts), "Protocol frozen-artifact coverage mismatch");
}

function main(): void {
	const [, , experimentRoot, repositoryRoot] = process.argv;
	if (!experimentRoot || !repositoryRoot) throw new Error("Usage: validate-preregistration.ts <experiment-root> <repository-root>");
	validatePreregistration(experimentRoot, repositoryRoot);
	process.stdout.write("PREREGISTRATION_VALID\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
