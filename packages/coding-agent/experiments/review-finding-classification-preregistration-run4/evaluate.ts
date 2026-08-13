import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

type Relation = "SAME_ROOT" | "DIFFERENT_ROOT" | "AMBIGUOUS";
type BinaryRelation = Exclude<Relation, "AMBIGUOUS">;
type Reviewer = "codex" | "claude";
type Condition = "A" | "B";
type Arm = "RUN_A_CONTROL" | "RUN_B_OPUS5";

interface GoldPair {
	pairId: string;
	leftItemId: string;
	rightItemId: string;
	relation: BinaryRelation;
}

interface GoldDocument {
	corpusVersion: string;
	pairCount: number;
	pairs: GoldPair[];
}

interface Classification {
	itemId: string;
	rootClass: string;
	affectedAbstraction?: string;
	confidence: number;
	conciseRationale: string;
}

interface PairDecision {
	pairId: string;
	decision: Relation;
	confidence: number;
	conciseRationale: string;
}

export interface ReviewerResult {
	condition: Condition;
	classifications: Classification[];
	pairs?: PairDecision[];
}

interface NormalizedResults {
	schemaVersion: number;
	arm: Arm;
	conditions: Record<Condition, Record<Reviewer, ReviewerResult>>;
}

interface ModelUsage {
	model: string;
	canonicalModel: string;
	provider: string;
	inputTokens: number;
	outputTokens: number;
}

interface InvocationMetadata {
	condition: Condition;
	reviewer: Reviewer;
	tool: string;
	toolVersion: string;
	requestedModel: string;
	exitCode: number;
	promptSha256: string;
	responseSchemaSha256: string;
	rawArtifact: string;
	rawArtifactSha256: string;
	eventsArtifact?: string;
	eventsArtifactSha256?: string;
	modelUsage: ModelUsage[];
}

export interface ExecutionMetadata {
	schemaVersion: number;
	arm: Arm;
	sourceSha: string;
	preregistrationSha: string;
	corpusVersion: string;
	blindCorpusSha256: string;
	goldPairsSha256: string;
	outputsMutuallyHiddenUntilFrozen: boolean;
	invocations: InvocationMetadata[];
}

export interface WilsonInterval {
	lower: number;
	upper: number;
}

export interface PairScore {
	correctSame: number;
	missedSame: number;
	ambiguousSame: number;
	correctDifferent: number;
	falseSame: number;
	ambiguousDifferent: number;
	correct: number;
	total: number;
	precision: number;
	sensitivity: number;
	specificity: number;
	f1: number;
	abstentionRate: number;
	sensitivityWilson95: WilsonInterval;
	specificityWilson95: WilsonInterval;
	accuracyWilson95: WilsonInterval;
}

const SOURCE_SHA = "bd247656aeeabea6b347bc892c0bfb9236fd7663";
const BLIND_CORPUS_SHA256 = "b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b";
const GOLD_PAIRS_SHA256 = "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b";
const PROMPT_SHA256: Record<Condition, string> = {
	A: "195cdf794aa2622f006e98dda49e9859a41b52d609996d3d10c22ee3c27b1357",
	B: "57ee2b3a0728fd1678fcdd8fcfe0b38f3b6c2b7ec09fbaf9a3e630648cf4a89e",
};
const RESPONSE_SCHEMA_SHA256: Record<Condition, string> = {
	A: "2d9cfaaff9402f16ef0d70c389386a68fddb63b300f416971b83d392bf16b616",
	B: "38d3a1d238637fedf867936013817772ea822a57d2e89516974347a96b1af36e",
};
const EXPECTED_ITEM_IDS = [
	"item-35c3b67009bb",
	"item-3966afa09ad1",
	"item-bbb7c7ac73c2",
	"item-b7c6f6de4069",
	"item-a588e8cfef87",
	"item-e5f809536c80",
	"item-8e66ef6bf977",
	"item-a36bcf847909",
	"item-9c3adb9fcc4e",
	"item-72de0587137f",
	"item-b0d3b9485cf6",
	"item-e617c2f887d8",
	"item-4711f03203e5",
	"item-32ff81ae4886",
	"item-947ca2472899",
	"item-b3bfdbc72ca4",
	"item-d1870bd04a50",
	"item-641b99358635",
	"item-5f2f1d019506",
	"item-1b9f06e7b080",
	"item-499a69824f00",
	"item-6b54c6516c14"
] as const;
const EXPECTED_PAIR_IDS = [
	"pair-ca8b1c1142",
	"pair-ce4d25d3f4",
	"pair-8bcc15fc51",
	"pair-2dd88829ae",
	"pair-5b24fe3ab8",
	"pair-4fa2b2b948",
	"pair-888ef856a9",
	"pair-fd55174c35",
	"pair-79bb8547e2",
	"pair-95d891cd78",
	"pair-8e297bb382",
	"pair-5f8fdb905d",
	"pair-a32f142911",
	"pair-b9d7d7d8af",
	"pair-80ac4fa066",
	"pair-a21e13518c"
] as const;

const EXACT_CRITERIA = {
	correctSameEachReviewer: 3,
	minimumCorrectDifferentEachReviewer: 12,
	minimumInterReviewerPairAgreement: 15,
	minimumOpenExactItemLabelAgreement: 18,
} as const;

function sha256File(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function assertExactOrder(actual: string[], expected: readonly string[], label: string): void {
	assert(actual.length === expected.length, `${label} count must be ${expected.length}`);
	for (let index = 0; index < expected.length; index += 1) {
		assert(actual[index] === expected[index], `${label} order mismatch at index ${index}`);
	}
}

function assertConfidence(value: number, label: string): void {
	assert(Number.isFinite(value) && value >= 0 && value <= 1, `${label} confidence must be between 0 and 1`);
}

export function normalizeRootClass(value: string): string {
	return value
		.normalize("NFKC")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function wilsonInterval(successes: number, total: number): WilsonInterval {
	assert(Number.isInteger(successes) && Number.isInteger(total), "Wilson inputs must be integers");
	assert(total > 0 && successes >= 0 && successes <= total, "Invalid Wilson inputs");
	const z = 1.959963984540054;
	const proportion = successes / total;
	const denominator = 1 + (z * z) / total;
	const center = proportion + (z * z) / (2 * total);
	const margin = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * total)) / total);
	return { lower: (center - margin) / denominator, upper: (center + margin) / denominator };
}

export function scoreRelations(gold: BinaryRelation[], predicted: Relation[]): PairScore {
	assert(gold.length === predicted.length && gold.length > 0, "Gold and prediction lengths must match");
	let correctSame = 0;
	let missedSame = 0;
	let ambiguousSame = 0;
	let correctDifferent = 0;
	let falseSame = 0;
	let ambiguousDifferent = 0;
	for (let index = 0; index < gold.length; index += 1) {
		if (gold[index] === "SAME_ROOT") {
			if (predicted[index] === "SAME_ROOT") correctSame += 1;
			else if (predicted[index] === "DIFFERENT_ROOT") missedSame += 1;
			else ambiguousSame += 1;
		} else if (predicted[index] === "DIFFERENT_ROOT") correctDifferent += 1;
		else if (predicted[index] === "SAME_ROOT") falseSame += 1;
		else ambiguousDifferent += 1;
	}
	const total = gold.length;
	const correct = correctSame + correctDifferent;
	const precisionDenominator = correctSame + falseSame;
	const precision = precisionDenominator === 0 ? 0 : correctSame / precisionDenominator;
	const sameTotal = correctSame + missedSame + ambiguousSame;
	const differentTotal = correctDifferent + falseSame + ambiguousDifferent;
	const sensitivity = correctSame / sameTotal;
	const specificity = correctDifferent / differentTotal;
	return {
		correctSame,
		missedSame,
		ambiguousSame,
		correctDifferent,
		falseSame,
		ambiguousDifferent,
		correct,
		total,
		precision,
		sensitivity,
		specificity,
		f1: precision + sensitivity === 0 ? 0 : (2 * precision * sensitivity) / (precision + sensitivity),
		abstentionRate: (ambiguousSame + ambiguousDifferent) / total,
		sensitivityWilson95: wilsonInterval(correctSame, sameTotal),
		specificityWilson95: wilsonInterval(correctDifferent, differentTotal),
		accuracyWilson95: wilsonInterval(correct, total),
	};
}

function validateReviewerResult(result: ReviewerResult, condition: Condition): void {
	assert(result.condition === condition, `Expected condition ${condition} result`);
	assertExactOrder(result.classifications.map((item) => item.itemId), EXPECTED_ITEM_IDS, `${condition} item`);
	for (const item of result.classifications) {
		assert(normalizeRootClass(item.rootClass).length > 0, `Empty root class for ${item.itemId}`);
		assertConfidence(item.confidence, item.itemId);
		assert(item.conciseRationale.trim().length > 0, `Empty rationale for ${item.itemId}`);
		if (condition === "B") assert((item.affectedAbstraction ?? "").trim().length > 0, `Missing affected abstraction for ${item.itemId}`);
	}
	if (condition === "A") {
		assert(result.pairs === undefined, "Condition A must not contain pair decisions");
		return;
	}
	assert(result.pairs !== undefined, "Condition B pair decisions are required");
	assertExactOrder(result.pairs.map((pair) => pair.pairId), EXPECTED_PAIR_IDS, "B pair");
	for (const pair of result.pairs) {
		assert(["SAME_ROOT", "DIFFERENT_ROOT", "AMBIGUOUS"].includes(pair.decision), `Invalid decision for ${pair.pairId}`);
		assertConfidence(pair.confidence, pair.pairId);
		assert(pair.conciseRationale.trim().length > 0, `Empty rationale for ${pair.pairId}`);
	}
}

function expectedModelSet(arm: Arm, reviewer: Reviewer): Set<string>[] {
	if (reviewer === "codex") return [new Set(["gpt-5.6-sol"])];
	if (arm === "RUN_A_CONTROL") return [new Set(["claude-opus-4-6"])];
	return [new Set(["claude-opus-5"]), new Set(["claude-opus-5", "claude-fable-5"])];
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

export function validateModelComposition(metadata: ExecutionMetadata): { arm: Arm; effectiveModels: Record<Reviewer, string[]> } {
	assert(metadata.schemaVersion === 1, "Unsupported execution metadata version");
	assert(metadata.sourceSha === SOURCE_SHA, "Execution source SHA mismatch");
	assert(/^[0-9a-f]{40}$/.test(metadata.preregistrationSha), "Invalid preregistration SHA");
	assert(metadata.corpusVersion === "frozen-1", "Corpus version mismatch");
	assert(metadata.blindCorpusSha256 === BLIND_CORPUS_SHA256, "Blind corpus hash mismatch");
	assert(metadata.goldPairsSha256 === GOLD_PAIRS_SHA256, "Gold-pair hash mismatch");
	assert(metadata.outputsMutuallyHiddenUntilFrozen, "Reviewer outputs were not mutually hidden");
	assert(metadata.invocations.length === 4, "Exactly four invocations are required");
	const seen = new Set<string>();
	const effectiveModels = { codex: [] as string[], claude: [] as string[] };
	for (const invocation of metadata.invocations) {
		const key = `${invocation.condition}:${invocation.reviewer}`;
		assert(!seen.has(key), `Duplicate invocation ${key}`);
		seen.add(key);
		assert(invocation.exitCode === 0, `${key} exit code was not zero`);
		assert(invocation.promptSha256 === PROMPT_SHA256[invocation.condition], `${key} prompt hash mismatch`);
		assert(invocation.responseSchemaSha256 === RESPONSE_SCHEMA_SHA256[invocation.condition], `${key} schema hash mismatch`);
		assert(/^[0-9a-f]{64}$/.test(invocation.rawArtifactSha256), `${key} raw-artifact hash is invalid`);
		assert(invocation.rawArtifact.trim().length > 0, `${key} raw-artifact path is empty`);
		const expectedTool = invocation.reviewer === "codex" ? "codex-cli" : "Claude Code";
		const expectedToolVersion = invocation.reviewer === "codex" ? "0.146.0" : "2.1.228";
		const expectedRequestedModel =
			invocation.reviewer === "codex"
				? "gpt-5.6-sol"
				: metadata.arm === "RUN_A_CONTROL"
					? "claude-opus-4-6"
					: "claude-opus-5";
		assert(invocation.tool === expectedTool, `${key} tool mismatch`);
		assert(invocation.toolVersion === expectedToolVersion, `${key} tool-version mismatch`);
		assert(invocation.requestedModel === expectedRequestedModel, `${key} requested-model mismatch`);
		const observed = new Set(invocation.modelUsage.map((usage) => usage.canonicalModel));
		assert(observed.size === invocation.modelUsage.length, `${key} has duplicate model-usage entries`);
		assert(
			expectedModelSet(metadata.arm, invocation.reviewer).some((allowed) => sameSet(observed, allowed)),
			`${key} effective model composition is not allowed`,
		);
		for (const usage of invocation.modelUsage) {
			assert(usage.model === usage.canonicalModel, `${key} model alias is not canonical`);
			assert(usage.inputTokens + usage.outputTokens > 0, `${key} model usage is empty`);
		}
		const sorted = [...observed].sort();
		if (effectiveModels[invocation.reviewer].length === 0) effectiveModels[invocation.reviewer] = sorted;
		else assert(sameSet(new Set(effectiveModels[invocation.reviewer]), observed), `${invocation.reviewer} composition differs by condition`);
	}
	for (const condition of ["A", "B"] as const) {
		for (const reviewer of ["codex", "claude"] as const) assert(seen.has(`${condition}:${reviewer}`), `Missing ${condition}:${reviewer} invocation`);
	}
	return { arm: metadata.arm, effectiveModels };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidencePath(root: string, declaredPath: string): string {
	assert(!isAbsolute(declaredPath), "Evidence paths must be relative");
	const rootPath = resolve(root);
	const candidate = resolve(rootPath, declaredPath);
	const fromRoot = relative(rootPath, candidate);
	assert(fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot), `Evidence path escapes its root: ${declaredPath}`);
	return candidate;
}

function readAndVerify(root: string, declaredPath: string, expectedSha256: string): string {
	const path = evidencePath(root, declaredPath);
	assert(sha256File(path) === expectedSha256, `Evidence hash mismatch for ${declaredPath}`);
	return readFileSync(path, "utf8");
}

function numericRecordTotal(value: unknown): number {
	if (!isRecord(value)) return 0;
	let total = 0;
	for (const entry of Object.values(value)) {
		if (typeof entry === "number") total += entry;
	}
	return total;
}

function verifyCodexEvidence(
	invocation: InvocationMetadata,
	rawText: string,
	executionRoot: string,
	expectedResult: ReviewerResult,
): void {
	assert(invocation.eventsArtifact !== undefined && invocation.eventsArtifactSha256 !== undefined, "Codex events evidence is required");
	const raw = JSON.parse(rawText) as unknown;
	assert(isDeepStrictEqual(raw, expectedResult), `Codex raw output differs from normalized ${invocation.condition} result`);
	const eventsText = readAndVerify(executionRoot, invocation.eventsArtifact, invocation.eventsArtifactSha256);
	let completedTurns = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	for (const line of eventsText.split("\n").filter((entry) => entry.trim().length > 0)) {
		const event = JSON.parse(line) as unknown;
		assert(isRecord(event) && typeof event.type === "string", "Invalid Codex event");
		if (event.type === "item.completed") {
			assert(isRecord(event.item) && typeof event.item.type === "string", "Invalid Codex item event");
			assert(["agent_message", "error", "reasoning"].includes(event.item.type), `Codex used or emitted an unrecognized item type: ${event.item.type}`);
		}
		if (event.type === "turn.completed") {
			assert(isRecord(event.usage), "Codex completion is missing usage");
			assert(typeof event.usage.input_tokens === "number" && typeof event.usage.output_tokens === "number", "Codex usage is incomplete");
			completedTurns += 1;
			inputTokens += event.usage.input_tokens;
			outputTokens += event.usage.output_tokens;
		}
	}
	assert(completedTurns === 1, "Codex evidence must contain exactly one completed turn");
	assert(invocation.modelUsage.length === 1, "Codex must have one model-usage entry");
	assert(invocation.modelUsage[0].inputTokens === inputTokens && invocation.modelUsage[0].outputTokens === outputTokens, "Codex token evidence mismatch");
}

function verifyClaudeEvidence(invocation: InvocationMetadata, rawText: string, expectedResult: ReviewerResult): void {
	assert(invocation.eventsArtifact === undefined && invocation.eventsArtifactSha256 === undefined, "Claude invocation must not declare Codex events");
	const raw = JSON.parse(rawText) as unknown;
	assert(isRecord(raw), "Claude raw envelope is not an object");
	assert(raw.is_error === false, "Claude raw envelope reports an error");
	assert(Array.isArray(raw.permission_denials) && raw.permission_denials.length === 0, "Claude reported permission denials");
	assert(isRecord(raw.usage) && numericRecordTotal(raw.usage.server_tool_use) === 0, "Claude reported server tool use");
	const candidate = raw.structured_output ?? raw.result;
	const parsed = typeof candidate === "string" ? (JSON.parse(candidate) as unknown) : candidate;
	assert(isDeepStrictEqual(parsed, expectedResult), `Claude raw output differs from normalized ${invocation.condition} result`);
	assert(isRecord(raw.modelUsage), "Claude modelUsage evidence is missing");
	const rawModels = Object.entries(raw.modelUsage)
		.map(([model, usage]) => {
			assert(isRecord(usage), `Claude modelUsage for ${model} is invalid`);
			assert(
				typeof usage.canonicalModel === "string" &&
					typeof usage.provider === "string" &&
					typeof usage.inputTokens === "number" &&
					typeof usage.outputTokens === "number",
				`Claude modelUsage for ${model} is incomplete`,
			);
			return {
				model,
				canonicalModel: usage.canonicalModel,
				provider: usage.provider,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
			};
		})
		.sort((left, right) => left.model.localeCompare(right.model));
	const declaredModels = [...invocation.modelUsage].sort((left, right) => left.model.localeCompare(right.model));
	assert(isDeepStrictEqual(rawModels, declaredModels), "Claude modelUsage metadata differs from the raw envelope");
}

function validateExecutionEvidence(metadata: ExecutionMetadata, input: NormalizedResults, executionRoot: string): void {
	const seenArtifacts = new Set<string>();
	for (const invocation of metadata.invocations) {
		assert(!seenArtifacts.has(invocation.rawArtifact), `Raw artifact reused: ${invocation.rawArtifact}`);
		seenArtifacts.add(invocation.rawArtifact);
		if (invocation.eventsArtifact !== undefined) {
			assert(!seenArtifacts.has(invocation.eventsArtifact), `Events artifact reused: ${invocation.eventsArtifact}`);
			seenArtifacts.add(invocation.eventsArtifact);
		}
		const rawText = readAndVerify(executionRoot, invocation.rawArtifact, invocation.rawArtifactSha256);
		const expectedResult = input.conditions[invocation.condition][invocation.reviewer];
		if (invocation.reviewer === "codex") verifyCodexEvidence(invocation, rawText, executionRoot, expectedResult);
		else verifyClaudeEvidence(invocation, rawText, expectedResult);
	}
}

function classificationMap(result: ReviewerResult): Map<string, Classification> {
	return new Map(result.classifications.map((item) => [item.itemId, item]));
}

function derivedRelations(gold: GoldPair[], result: ReviewerResult): Relation[] {
	const items = classificationMap(result);
	return gold.map((pair) => {
		const left = items.get(pair.leftItemId);
		const right = items.get(pair.rightItemId);
		assert(left !== undefined && right !== undefined, `Missing classification for ${pair.pairId}`);
		return normalizeRootClass(left.rootClass) === normalizeRootClass(right.rootClass) ? "SAME_ROOT" : "DIFFERENT_ROOT";
	});
}

function explicitRelations(result: ReviewerResult): Relation[] {
	assert(result.pairs !== undefined, "Explicit pairs are required");
	return result.pairs.map((pair) => pair.decision);
}

function exactAgreement(left: Relation[], right: Relation[]): number {
	assert(left.length === right.length, "Agreement vectors differ in length");
	return left.filter((value, index) => value === right[index]).length;
}

function exactItemLabelAgreement(left: ReviewerResult, right: ReviewerResult): number {
	const rightItems = classificationMap(right);
	return left.classifications.filter((item) => {
		const other = rightItems.get(item.itemId);
		return other !== undefined && normalizeRootClass(item.rootClass) === normalizeRootClass(other.rootClass);
	}).length;
}

function confidenceSummary(values: number[]): { count: number; mean: number; median: number; bins: Record<string, number> } {
	assert(values.length > 0, "Confidence summary requires values");
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
	const bins = { "[0,0.5)": 0, "[0.5,0.7)": 0, "[0.7,0.85)": 0, "[0.85,1]": 0 };
	for (const value of values) {
		if (value < 0.5) bins["[0,0.5)"] += 1;
		else if (value < 0.7) bins["[0.5,0.7)"] += 1;
		else if (value < 0.85) bins["[0.7,0.85)"] += 1;
		else bins["[0.85,1]"] += 1;
	}
	return { count: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length, median, bins };
}

function pairCalibration(gold: BinaryRelation[], result: ReviewerResult): { brierScore: number | null; scored: number; ambiguousExcluded: number } {
	assert(result.pairs !== undefined, "Pair calibration requires pair decisions");
	let squaredError = 0;
	let scored = 0;
	let ambiguousExcluded = 0;
	for (let index = 0; index < gold.length; index += 1) {
		const pair = result.pairs[index];
		if (pair.decision === "AMBIGUOUS") {
			ambiguousExcluded += 1;
			continue;
		}
		const correct = pair.decision === gold[index] ? 1 : 0;
		squaredError += (pair.confidence - correct) ** 2;
		scored += 1;
	}
	return { brierScore: scored === 0 ? null : squaredError / scored, scored, ambiguousExcluded };
}

function reviewerPass(score: PairScore): boolean {
	return score.correctSame === EXACT_CRITERIA.correctSameEachReviewer && score.correctDifferent >= EXACT_CRITERIA.minimumCorrectDifferentEachReviewer;
}

export function evaluate(gold: GoldDocument, input: NormalizedResults, metadata: ExecutionMetadata) {
	assert(input.schemaVersion === 1, "Unsupported normalized-results version");
	assert(input.arm === metadata.arm, "Result and metadata arms differ");
	assert(gold.corpusVersion === "frozen-1" && gold.pairCount === 16 && gold.pairs.length === 16, "Gold document identity mismatch");
	assertExactOrder(gold.pairs.map((pair) => pair.pairId), EXPECTED_PAIR_IDS, "Gold pair");
	const sameCount = gold.pairs.filter((pair) => pair.relation === "SAME_ROOT").length;
	const differentCount = gold.pairs.filter((pair) => pair.relation === "DIFFERENT_ROOT").length;
	assert(sameCount === 3 && differentCount === 13, "Gold relation counts differ from preregistration");
	const composition = validateModelComposition(metadata);
	for (const condition of ["A", "B"] as const) {
		for (const reviewer of ["codex", "claude"] as const) validateReviewerResult(input.conditions[condition][reviewer], condition);
	}
	const goldRelations = gold.pairs.map((pair) => pair.relation);
	const aCodexRelations = derivedRelations(gold.pairs, input.conditions.A.codex);
	const aClaudeRelations = derivedRelations(gold.pairs, input.conditions.A.claude);
	const bCodexRelations = explicitRelations(input.conditions.B.codex);
	const bClaudeRelations = explicitRelations(input.conditions.B.claude);
	const aCodex = scoreRelations(goldRelations, aCodexRelations);
	const aClaude = scoreRelations(goldRelations, aClaudeRelations);
	const bCodex = scoreRelations(goldRelations, bCodexRelations);
	const bClaude = scoreRelations(goldRelations, bClaudeRelations);
	const aPairAgreement = exactAgreement(aCodexRelations, aClaudeRelations);
	const bPairAgreement = exactAgreement(bCodexRelations, bClaudeRelations);
	const aItemLabelAgreement = exactItemLabelAgreement(input.conditions.A.codex, input.conditions.A.claude);
	const conditionAPass =
		reviewerPass(aCodex) &&
		reviewerPass(aClaude) &&
		aPairAgreement >= EXACT_CRITERIA.minimumInterReviewerPairAgreement &&
		aItemLabelAgreement >= EXACT_CRITERIA.minimumOpenExactItemLabelAgreement;
	const conditionBPass =
		reviewerPass(bCodex) && reviewerPass(bClaude) && bPairAgreement >= EXACT_CRITERIA.minimumInterReviewerPairAgreement;
	const conclusion = conditionAPass
		? "EXTENSION_SUFFICIENT_WITH_EXPLICIT_CLASSES"
		: conditionBPass
			? "EXTENSION_SUFFICIENT_WITH_RUBRIC_OR_HUMAN_GATE"
			: "CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED";
	return {
		schemaVersion: 1,
		arm: input.arm,
		sourceSha: SOURCE_SHA,
		preregistrationSha: metadata.preregistrationSha,
		corpus: { version: "frozen-1", blindCorpusSha256: BLIND_CORPUS_SHA256, goldPairsSha256: GOLD_PAIRS_SHA256 },
		composition,
		criteria: EXACT_CRITERIA,
		uncertaintyPolicy: "Two-sided Wilson 95% intervals are descriptive only; exact counts determine the gate.",
		conditions: {
			A: {
				pass: conditionAPass,
				interReviewerPairAgreement: { equal: aPairAgreement, total: 16, wilson95: wilsonInterval(aPairAgreement, 16) },
				exactItemLabelAgreement: { equal: aItemLabelAgreement, total: 22, wilson95: wilsonInterval(aItemLabelAgreement, 22) },
				codex: { pairScore: aCodex, itemConfidence: confidenceSummary(input.conditions.A.codex.classifications.map((item) => item.confidence)) },
				claude: { pairScore: aClaude, itemConfidence: confidenceSummary(input.conditions.A.claude.classifications.map((item) => item.confidence)) },
			},
			B: {
				pass: conditionBPass,
				interReviewerPairAgreement: { equal: bPairAgreement, total: 16, wilson95: wilsonInterval(bPairAgreement, 16) },
				codex: {
					pairScore: bCodex,
					itemConfidence: confidenceSummary(input.conditions.B.codex.classifications.map((item) => item.confidence)),
					pairConfidence: confidenceSummary(input.conditions.B.codex.pairs?.map((pair) => pair.confidence) ?? []),
					pairCalibration: pairCalibration(goldRelations, input.conditions.B.codex),
				},
				claude: {
					pairScore: bClaude,
					itemConfidence: confidenceSummary(input.conditions.B.claude.classifications.map((item) => item.confidence)),
					pairConfidence: confidenceSummary(input.conditions.B.claude.pairs?.map((pair) => pair.confidence) ?? []),
					pairCalibration: pairCalibration(goldRelations, input.conditions.B.claude),
				},
			},
		},
		conclusion,
	};
}

function main(): void {
	const [, , goldPath, inputPath, metadataPath, outputPath] = process.argv;
	if (!goldPath || !inputPath || !metadataPath || !outputPath) {
		throw new Error("Usage: evaluate.ts <gold-pairs.json> <normalized-results.json> <execution-metadata.json> <metrics.json>");
	}
	assert(sha256File(goldPath) === GOLD_PAIRS_SHA256, "Gold-pair file hash mismatch");
	const gold = JSON.parse(readFileSync(goldPath, "utf8")) as GoldDocument;
	const input = JSON.parse(readFileSync(inputPath, "utf8")) as NormalizedResults;
	const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as ExecutionMetadata;
	validateExecutionEvidence(metadata, input, dirname(metadataPath));
	writeFileSync(outputPath, `${JSON.stringify(evaluate(gold, input, metadata), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
