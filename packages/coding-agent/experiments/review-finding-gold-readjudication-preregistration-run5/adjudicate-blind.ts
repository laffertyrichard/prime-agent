import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	assert,
	assertExactKeys,
	determineFinalDecision,
	isRecord,
	type AdjudicatorDecision,
} from "./adjudication-lib.js";

interface Adjudication {
	caseId: string;
	decision: AdjudicatorDecision;
	causalProximity: "CLOSE" | "INTERMEDIATE" | "DISTANT" | "UNCERTAIN";
	confidence: number;
	coherentRemediation: string;
	rationale: string;
}

interface MetadataIdentity {
	adjudicatorId: "ADJUDICATOR_CODEX" | "ADJUDICATOR_CLAUDE";
	tool: string;
	toolVersion: string;
	requestedModel: string;
	effectiveModels: string[];
	provider: string;
	exitCode: number;
	outputSha256: string;
	toolUseObserved: boolean;
	rawEvidenceSha256: string;
	telemetrySha256: string | null;
}

const SOURCE_EVIDENCE_SHA = "f1450e95a197b91998550566e36484f046a2a8ed";
const decisions = new Set<AdjudicatorDecision>(["SAME_ROOT", "DIFFERENT_ROOT", "ABSTAIN"]);
const proximities = new Set(["CLOSE", "INTERMEDIATE", "DISTANT", "UNCERTAIN"]);

function readObject(path: string): Record<string, unknown> {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	assert(isRecord(parsed), `Expected object in ${path}`);
	return parsed;
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readCaseIds(packetPath: string): string[] {
	const root = readObject(packetPath);
	assertExactKeys(root, ["schemaVersion", "packetVersion", "caseCount", "cases"], packetPath);
	assert(root.schemaVersion === 1 && root.caseCount === 16 && Array.isArray(root.cases) && root.cases.length === 16, "Invalid blind packet root");
	const caseIds = root.cases.map((entry, index) => {
		assert(isRecord(entry), `Invalid blind case ${index}`);
		assertExactKeys(entry, ["caseId", "manifestationA", "manifestationB"], `blind case ${index}`);
		assert(typeof entry.caseId === "string" && typeof entry.manifestationA === "string" && typeof entry.manifestationB === "string", `Invalid blind case ${index}`);
		return entry.caseId;
	});
	assert(new Set(caseIds).size === 16, "Duplicate blind case ID");
	return caseIds;
}

function parseResponse(path: string, expectedCaseIds: string[], expectedPacketHash: string): Adjudication[] {
	const root = readObject(path);
	assertExactKeys(root, ["schemaVersion", "packetSha256", "adjudications"], path);
	assert(root.schemaVersion === 1 && root.packetSha256 === expectedPacketHash && Array.isArray(root.adjudications), `Invalid response root: ${path}`);
	assert(root.adjudications.length === expectedCaseIds.length, `Response count mismatch: ${path}`);
	const parsed = root.adjudications.map((entry, index): Adjudication => {
		assert(isRecord(entry), `Invalid response entry ${index}: ${path}`);
		assertExactKeys(entry, ["caseId", "decision", "causalProximity", "confidence", "coherentRemediation", "rationale"], `${path}:${index}`);
		assert(typeof entry.caseId === "string", `Invalid caseId: ${path}:${index}`);
		assert(typeof entry.decision === "string" && decisions.has(entry.decision as AdjudicatorDecision), `Invalid decision: ${path}:${index}`);
		assert(typeof entry.causalProximity === "string" && proximities.has(entry.causalProximity), `Invalid proximity: ${path}:${index}`);
		assert(typeof entry.confidence === "number" && Number.isFinite(entry.confidence) && entry.confidence >= 0 && entry.confidence <= 1, `Invalid confidence: ${path}:${index}`);
		assert(typeof entry.coherentRemediation === "string" && entry.coherentRemediation.length >= 1 && entry.coherentRemediation.length <= 600, `Invalid remediation: ${path}:${index}`);
		assert(typeof entry.rationale === "string" && entry.rationale.length >= 1 && entry.rationale.length <= 800, `Invalid rationale: ${path}:${index}`);
		return entry as unknown as Adjudication;
	});
	assert(JSON.stringify(parsed.map((entry) => entry.caseId)) === JSON.stringify(expectedCaseIds), `Response case order or coverage mismatch: ${path}`);
	return parsed;
}

function parseMetadata(path: string): { authorizedPreregistrationSha: string; promptSha256: string; responseSchemaSha256: string; executionPreflightSha256: string; rawPrefreezeManifestSha256: string; adjudicators: MetadataIdentity[] } {
	const root = readObject(path);
	assertExactKeys(root, ["schemaVersion", "authorizedPreregistrationSha", "sourceEvidenceSha", "rawPrefreezeManifestSha256", "executionPreflightSha256", "promptSha256", "responseSchemaSha256", "outputsMutuallyHiddenUntilFrozen", "adjudicators"], path);
	assert(root.schemaVersion === 1 && typeof root.authorizedPreregistrationSha === "string" && /^[0-9a-f]{40}$/.test(root.authorizedPreregistrationSha), "Invalid authorized preregistration SHA");
	assert(root.sourceEvidenceSha === SOURCE_EVIDENCE_SHA, "Metadata source evidence mismatch");
	assert(typeof root.rawPrefreezeManifestSha256 === "string" && /^[0-9a-f]{64}$/.test(root.rawPrefreezeManifestSha256), "Invalid raw prefreeze manifest hash");
	assert(typeof root.executionPreflightSha256 === "string" && /^[0-9a-f]{64}$/.test(root.executionPreflightSha256), "Invalid preflight hash");
	assert(typeof root.promptSha256 === "string" && typeof root.responseSchemaSha256 === "string", "Invalid metadata artifact hashes");
	assert(root.outputsMutuallyHiddenUntilFrozen === true && Array.isArray(root.adjudicators) && root.adjudicators.length === 2, "Invalid independence evidence");
	const identities = root.adjudicators.map((entry, index) => {
		assert(isRecord(entry), `Invalid metadata identity ${index}`);
		assertExactKeys(entry, ["adjudicatorId", "tool", "toolVersion", "requestedModel", "effectiveModels", "provider", "exitCode", "outputSha256", "toolUseObserved", "rawEvidenceSha256", "telemetrySha256"], `metadata identity ${index}`);
		assert(entry.adjudicatorId === "ADJUDICATOR_CODEX" || entry.adjudicatorId === "ADJUDICATOR_CLAUDE", `Invalid adjudicator ID ${index}`);
		assert(typeof entry.tool === "string" && typeof entry.toolVersion === "string" && typeof entry.requestedModel === "string" && typeof entry.provider === "string", `Invalid identity strings ${index}`);
		assert(Array.isArray(entry.effectiveModels) && entry.effectiveModels.every((model) => typeof model === "string"), `Invalid effective models ${index}`);
		assert(entry.exitCode === 0 && typeof entry.outputSha256 === "string" && /^[0-9a-f]{64}$/.test(entry.outputSha256) && entry.toolUseObserved === false, `Invalid execution evidence ${index}`);
		assert(typeof entry.rawEvidenceSha256 === "string" && /^[0-9a-f]{64}$/.test(entry.rawEvidenceSha256), `Invalid raw evidence hash ${index}`);
		assert(entry.telemetrySha256 === null || (typeof entry.telemetrySha256 === "string" && /^[0-9a-f]{64}$/.test(entry.telemetrySha256)), `Invalid telemetry hash ${index}`);
		return entry as unknown as MetadataIdentity;
	});
	return { authorizedPreregistrationSha: root.authorizedPreregistrationSha, rawPrefreezeManifestSha256: root.rawPrefreezeManifestSha256, executionPreflightSha256: root.executionPreflightSha256, promptSha256: root.promptSha256, responseSchemaSha256: root.responseSchemaSha256, adjudicators: identities };
}

function validateIdentity(identity: MetadataIdentity): void {
	if (identity.adjudicatorId === "ADJUDICATOR_CODEX") {
		assert(identity.tool === "codex-cli" && identity.toolVersion === "0.146.0", "Codex tool identity mismatch");
		assert(identity.requestedModel === "gpt-5.6-sol" && identity.provider === "openai", "Codex model identity mismatch");
		assert(JSON.stringify(identity.effectiveModels) === JSON.stringify(["gpt-5.6-sol"]), "Codex effective model mismatch");
		return;
	}
	assert(identity.tool === "Claude Code" && identity.toolVersion === "2.1.228", "Claude tool identity mismatch");
	assert(identity.requestedModel === "claude-opus-5" && identity.provider === "firstParty", "Claude model identity mismatch");
	const effective = JSON.stringify(identity.effectiveModels);
	assert(effective === JSON.stringify(["claude-opus-5"]) || effective === JSON.stringify(["claude-opus-5", "claude-fable-5"]), "Claude effective model mismatch");
}

export function adjudicateBlind(experimentRoot: string, rawManifestPath: string, codexPath: string, codexEventsPath: string, claudePath: string, claudeRawPath: string, metadataPath: string, preflightPath: string): Record<string, unknown> {
	const protocol = readObject(join(experimentRoot, "protocol.json"));
	assert(isRecord(protocol.source) && protocol.source.evidenceSha === SOURCE_EVIDENCE_SHA, "Protocol evidence SHA mismatch");
	assert(isRecord(protocol.frozenArtifacts), "Protocol artifact hashes missing");
	const packetPath = join(experimentRoot, "blind-packet.json");
	const packetHash = sha256(packetPath);
	assert(packetHash === protocol.frozenArtifacts["blind-packet.json"], "Blind packet bytes changed");
	const caseIds = readCaseIds(packetPath);
	const metadata = parseMetadata(metadataPath);
	assert(metadata.promptSha256 === sha256(join(experimentRoot, "prompts/adjudication.txt")) && metadata.promptSha256 === protocol.frozenArtifacts["prompts/adjudication.txt"], "Prompt evidence mismatch");
	assert(metadata.responseSchemaSha256 === sha256(join(experimentRoot, "schemas/adjudication-response.schema.json")) && metadata.responseSchemaSha256 === protocol.frozenArtifacts["schemas/adjudication-response.schema.json"], "Schema evidence mismatch");
	const identityById = new Map(metadata.adjudicators.map((identity) => [identity.adjudicatorId, identity]));
	assert(identityById.size === 2, "Duplicate adjudicator identity");
	const codexIdentity = identityById.get("ADJUDICATOR_CODEX");
	const claudeIdentity = identityById.get("ADJUDICATOR_CLAUDE");
	assert(codexIdentity !== undefined && claudeIdentity !== undefined, "Missing adjudicator identity");
	validateIdentity(codexIdentity);
	validateIdentity(claudeIdentity);
	assert(metadata.rawPrefreezeManifestSha256 === sha256(rawManifestPath), "Raw prefreeze manifest hash mismatch");
	assert(metadata.executionPreflightSha256 === sha256(preflightPath), "Execution preflight hash mismatch");
	assert(codexIdentity.outputSha256 === sha256(codexPath) && codexIdentity.rawEvidenceSha256 === sha256(codexPath) && codexIdentity.telemetrySha256 === sha256(codexEventsPath), "Codex evidence hash mismatch");
	assert(claudeIdentity.outputSha256 === sha256(claudePath) && claudeIdentity.rawEvidenceSha256 === sha256(claudeRawPath) && claudeIdentity.telemetrySha256 === null, "Claude evidence hash mismatch");
	const codex = parseResponse(codexPath, caseIds, packetHash);
	const claude = parseResponse(claudePath, caseIds, packetHash);
	const cases = caseIds.map((caseId, index) => {
		const decision = determineFinalDecision(codex[index].decision, claude[index].decision);
		return {
			caseId,
			adjudicatorDecisions: { ADJUDICATOR_CODEX: codex[index].decision, ADJUDICATOR_CLAUDE: claude[index].decision },
			causalProximity: { ADJUDICATOR_CODEX: codex[index].causalProximity, ADJUDICATOR_CLAUDE: claude[index].causalProximity },
			confidence: { codex: codex[index].confidence, claude: claude[index].confidence, minimum: Math.min(codex[index].confidence, claude[index].confidence), maximum: Math.max(codex[index].confidence, claude[index].confidence) },
			...decision,
		};
	});
	const count = (status: string): number => cases.filter((entry) => entry.status === status).length;
	return {
		schemaVersion: 1,
		sourceEvidenceSha: SOURCE_EVIDENCE_SHA,
		authorizedPreregistrationSha: metadata.authorizedPreregistrationSha,
		packetSha256: packetHash,
		responseSha256: { ADJUDICATOR_CODEX: codexIdentity.outputSha256, ADJUDICATOR_CLAUDE: claudeIdentity.outputSha256 },
		caseCount: cases.length,
		summary: { confirmedBinary: count("CONFIRMED_BINARY"), unresolvedDisagreement: count("UNRESOLVED_DISAGREEMENT"), unresolvedAbstention: count("UNRESOLVED_ABSTENTION") },
		cases,
	};
}

function main(): void {
	const [, , experimentRoot, rawManifestPath, codexPath, codexEventsPath, claudePath, claudeRawPath, metadataPath, preflightPath, outputPath] = process.argv;
	if (!experimentRoot || !rawManifestPath || !codexPath || !codexEventsPath || !claudePath || !claudeRawPath || !metadataPath || !preflightPath || !outputPath) throw new Error("Usage: adjudicate-blind.ts <experiment-root> <raw-prefreeze-manifest> <codex-response> <codex-events> <claude-response> <claude-envelope> <execution-metadata> <execution-preflight> <output>");
	writeFileSync(outputPath, `${JSON.stringify(adjudicateBlind(experimentRoot, rawManifestPath, codexPath, codexEventsPath, claudePath, claudeRawPath, metadataPath, preflightPath), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
