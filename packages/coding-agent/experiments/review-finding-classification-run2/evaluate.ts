import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
	assessReviewState,
	createReviewState,
	recordFinding,
	recordRemediation,
	type ReviewState,
} from "../../examples/extensions/review-findings.js";

type Relation = "SAME_ROOT" | "DIFFERENT_ROOT" | "AMBIGUOUS";
type Reviewer = "codex" | "claude";
type Condition = "A" | "B";

interface GoldPair {
	pairId: string;
	leftFindingId: string;
	rightFindingId: string;
	goldRelation: Relation;
	adjudicationRationale: string;
}

interface Classification {
	findingId: string;
	rootClass: string;
	affectedAbstraction?: string;
	confidence?: number;
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

interface EvaluationInput {
	conditions: Record<Condition, Record<Reviewer, ReviewerResult>>;
}

interface GoldDocument {
	pairs: GoldPair[];
}

export interface BinaryMetrics {
	tp: number;
	fp: number;
	tn: number;
	fn: number;
	precision: number;
	recall: number;
	f1: number;
	falseCheckpointRate: number;
	missedCheckpointRate: number;
}

const THRESHOLDS = {
	pairwiseF1: 0.8,
	interReviewerAgreement: 0.8,
	falseCheckpointRate: 0.05,
	missedCheckpointRate: 0.1,
	openExactLabelAgreement: 0.8,
} as const;

export function normalizeRootClass(value: string): string {
	return value
		.normalize("NFKC")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function calculateBinaryMetrics(gold: Relation[], predicted: Relation[]): BinaryMetrics {
	if (gold.length !== predicted.length) throw new Error("Gold and prediction lengths differ");
	let tp = 0;
	let fp = 0;
	let tn = 0;
	let fn = 0;
	for (let index = 0; index < gold.length; index += 1) {
		if (gold[index] === "AMBIGUOUS") continue;
		const expectedSame = gold[index] === "SAME_ROOT";
		const predictedSame = predicted[index] === "SAME_ROOT";
		if (expectedSame && predictedSame) tp += 1;
		else if (expectedSame) fn += 1;
		else if (predictedSame) fp += 1;
		else tn += 1;
	}
	const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
	const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
	return {
		tp,
		fp,
		tn,
		fn,
		precision,
		recall,
		f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
		falseCheckpointRate: fp + tn === 0 ? 0 : fp / (fp + tn),
		missedCheckpointRate: fn + tp === 0 ? 0 : fn / (fn + tp),
	};
}

function addFinding(state: ReviewState, id: string, reviewShaDigit: string, rootClass: string): ReviewState {
	return recordFinding(state, {
		id,
		reviewSha: reviewShaDigit.repeat(40),
		reviewerRole: "classification-replay",
		severity: "blocking",
		rootClass,
		affectedAbstraction: id,
		evidence: `Frozen classification replay for ${id}`,
		disposition: "confirmed",
	}).state;
}

export function replayPair(leftRootClass: string, rightRootClass: string): boolean {
	const left = normalizeRootClass(leftRootClass);
	const right = normalizeRootClass(rightRootClass);
	let state = addFinding(createReviewState(), "left-1", "1", left);
	state = recordRemediation(state, { rootClass: left, remediationSha: "2".repeat(40) }).state;
	state = addFinding(state, "right-1", "3", right);
	state = recordRemediation(state, { rootClass: right, remediationSha: "4".repeat(40) }).state;
	state = addFinding(state, "left-2", "5", left);
	return assessReviewState(state, "5".repeat(40)).status === "ARCHITECTURE_CHECKPOINT";
}

function classificationMap(result: ReviewerResult): Map<string, Classification> {
	const map = new Map<string, Classification>();
	for (const item of result.classifications) {
		if (map.has(item.findingId)) throw new Error(`Duplicate classification ${item.findingId}`);
		if (!normalizeRootClass(item.rootClass)) throw new Error(`Empty root class ${item.findingId}`);
		map.set(item.findingId, item);
	}
	return map;
}

function pairDecisionMap(result: ReviewerResult): Map<string, PairDecision> {
	const map = new Map<string, PairDecision>();
	for (const item of result.pairs ?? []) {
		if (map.has(item.pairId)) throw new Error(`Duplicate pair decision ${item.pairId}`);
		map.set(item.pairId, item);
	}
	return map;
}

function derivedLabelDecisions(pairs: GoldPair[], result: ReviewerResult): Relation[] {
	const classifications = classificationMap(result);
	return pairs.map((pair) => {
		const left = classifications.get(pair.leftFindingId);
		const right = classifications.get(pair.rightFindingId);
		if (!left || !right) throw new Error(`Missing classification for ${pair.pairId}`);
		return normalizeRootClass(left.rootClass) === normalizeRootClass(right.rootClass)
			? "SAME_ROOT"
			: "DIFFERENT_ROOT";
	});
}

function explicitDecisions(pairs: GoldPair[], result: ReviewerResult): Relation[] {
	const decisions = pairDecisionMap(result);
	return pairs.map((pair) => {
		const decision = decisions.get(pair.pairId);
		if (!decision) throw new Error(`Missing pair decision ${pair.pairId}`);
		return decision.decision;
	});
}

function replayDecisions(pairs: GoldPair[], result: ReviewerResult, gateByPairDecision: boolean): Relation[] {
	const classifications = classificationMap(result);
	const decisions = pairDecisionMap(result);
	return pairs.map((pair) => {
		const left = classifications.get(pair.leftFindingId);
		const right = classifications.get(pair.rightFindingId);
		if (!left || !right) throw new Error(`Missing classification for ${pair.pairId}`);
		let leftRoot = normalizeRootClass(left.rootClass);
		let rightRoot = normalizeRootClass(right.rootClass);
		if (gateByPairDecision) {
			const decision = decisions.get(pair.pairId)?.decision;
			if (!decision) throw new Error(`Missing pair decision ${pair.pairId}`);
			if (decision === "SAME_ROOT") rightRoot = leftRoot;
			else if (decision === "DIFFERENT_ROOT" && rightRoot === leftRoot) rightRoot = `${rightRoot}_DISTINCT`;
			else if (decision === "AMBIGUOUS") return "AMBIGUOUS";
		}
		return replayPair(leftRoot, rightRoot) ? "SAME_ROOT" : "DIFFERENT_ROOT";
	});
}

function agreement(left: Relation[], right: Relation[], gold: Relation[]): number {
	let compared = 0;
	let equal = 0;
	for (let index = 0; index < gold.length; index += 1) {
		if (gold[index] === "AMBIGUOUS") continue;
		compared += 1;
		if (left[index] === right[index]) equal += 1;
	}
	return compared === 0 ? 0 : equal / compared;
}

function exactItemAgreement(left: ReviewerResult, right: ReviewerResult): number {
	const leftMap = classificationMap(left);
	const rightMap = classificationMap(right);
	let equal = 0;
	for (const [id, item] of leftMap) {
		const other = rightMap.get(id);
		if (!other) throw new Error(`Missing cross-reviewer classification ${id}`);
		if (normalizeRootClass(item.rootClass) === normalizeRootClass(other.rootClass)) equal += 1;
	}
	return leftMap.size === 0 ? 0 : equal / leftMap.size;
}

function ambiguousRate(values: Relation[]): number {
	return values.filter((value) => value === "AMBIGUOUS").length / values.length;
}

function passes(metrics: BinaryMetrics): boolean {
	return (
		metrics.f1 >= THRESHOLDS.pairwiseF1 &&
		metrics.falseCheckpointRate <= THRESHOLDS.falseCheckpointRate &&
		metrics.missedCheckpointRate <= THRESHOLDS.missedCheckpointRate
	);
}

export function evaluate(gold: GoldDocument, input: EvaluationInput) {
	const goldRelations = gold.pairs.map((pair) => pair.goldRelation);
	const conditions = {} as Record<Condition, Record<string, unknown>>;
	for (const condition of ["A", "B"] as const) {
		const codex = input.conditions[condition].codex;
		const claude = input.conditions[condition].claude;
		const codexDerived = derivedLabelDecisions(gold.pairs, codex);
		const claudeDerived = derivedLabelDecisions(gold.pairs, claude);
		const codexReplay = replayDecisions(gold.pairs, codex, false);
		const claudeReplay = replayDecisions(gold.pairs, claude, false);
		const summary: Record<string, unknown> = {
			exactNormalizedRootClassAgreement: exactItemAgreement(codex, claude),
			labelDerivedInterReviewerAgreement: agreement(codexDerived, claudeDerived, goldRelations),
			codex: {
				labelDerivedPairMetrics: calculateBinaryMetrics(goldRelations, codexDerived),
				rawLabelReplayMetrics: calculateBinaryMetrics(goldRelations, codexReplay),
			},
			claude: {
				labelDerivedPairMetrics: calculateBinaryMetrics(goldRelations, claudeDerived),
				rawLabelReplayMetrics: calculateBinaryMetrics(goldRelations, claudeReplay),
			},
		};
		if (condition === "B") {
			const codexExplicit = explicitDecisions(gold.pairs, codex);
			const claudeExplicit = explicitDecisions(gold.pairs, claude);
			const codexGatedReplay = replayDecisions(gold.pairs, codex, true);
			const claudeGatedReplay = replayDecisions(gold.pairs, claude, true);
			summary.explicitInterReviewerAgreement = agreement(codexExplicit, claudeExplicit, goldRelations);
			summary.codex = {
				...(summary.codex as Record<string, unknown>),
				explicitPairMetrics: calculateBinaryMetrics(goldRelations, codexExplicit),
				decisionGatedReplayMetrics: calculateBinaryMetrics(goldRelations, codexGatedReplay),
				ambiguousCaseRate: ambiguousRate(codexExplicit),
			};
			summary.claude = {
				...(summary.claude as Record<string, unknown>),
				explicitPairMetrics: calculateBinaryMetrics(goldRelations, claudeExplicit),
				decisionGatedReplayMetrics: calculateBinaryMetrics(goldRelations, claudeGatedReplay),
				ambiguousCaseRate: ambiguousRate(claudeExplicit),
			};
			const namingDisagreements = gold.pairs.flatMap((pair, index) => {
				if (pair.goldRelation !== "SAME_ROOT") return [];
				const reviewers: Reviewer[] = [];
				if (codexExplicit[index] === "SAME_ROOT" && codexDerived[index] !== "SAME_ROOT") reviewers.push("codex");
				if (claudeExplicit[index] === "SAME_ROOT" && claudeDerived[index] !== "SAME_ROOT") reviewers.push("claude");
				return reviewers.map((reviewer) => ({ pairId: pair.pairId, reviewer }));
			});
			summary.namingDisagreements = namingDisagreements;
			summary.substantiveDisagreements = gold.pairs.flatMap((pair, index) => {
				if (pair.goldRelation === "AMBIGUOUS") return [];
				const disagreements: Array<{ pairId: string; reviewer: Reviewer; predicted: Relation }> = [];
				if (codexExplicit[index] !== pair.goldRelation) disagreements.push({ pairId: pair.pairId, reviewer: "codex", predicted: codexExplicit[index] });
				if (claudeExplicit[index] !== pair.goldRelation) disagreements.push({ pairId: pair.pairId, reviewer: "claude", predicted: claudeExplicit[index] });
				return disagreements;
			});
		}
		conditions[condition] = summary;
	}
	const a = conditions.A;
	const aCodex = (a.codex as { rawLabelReplayMetrics: BinaryMetrics }).rawLabelReplayMetrics;
	const aClaude = (a.claude as { rawLabelReplayMetrics: BinaryMetrics }).rawLabelReplayMetrics;
	const openStable =
		passes(aCodex) &&
		passes(aClaude) &&
		(a.labelDerivedInterReviewerAgreement as number) >= THRESHOLDS.interReviewerAgreement &&
		(a.exactNormalizedRootClassAgreement as number) >= THRESHOLDS.openExactLabelAgreement;
	const b = conditions.B;
	const bCodex = (b.codex as { explicitPairMetrics: BinaryMetrics; decisionGatedReplayMetrics: BinaryMetrics });
	const bClaude = (b.claude as { explicitPairMetrics: BinaryMetrics; decisionGatedReplayMetrics: BinaryMetrics });
	const rubricUseful =
		passes(bCodex.explicitPairMetrics) &&
		passes(bClaude.explicitPairMetrics) &&
		passes(bCodex.decisionGatedReplayMetrics) &&
		passes(bClaude.decisionGatedReplayMetrics) &&
		(b.explicitInterReviewerAgreement as number) >= THRESHOLDS.interReviewerAgreement;
	const architectureConclusion = openStable
		? "EXTENSION_SUFFICIENT_WITH_EXPLICIT_CLASSES"
		: rubricUseful
			? "EXTENSION_SUFFICIENT_WITH_RUBRIC_OR_HUMAN_GATE"
			: "CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED";
	return { thresholds: THRESHOLDS, conditions, openStable, rubricUseful, architectureConclusion };
}

function main(): void {
	const [, , goldPath, inputPath, outputPath] = process.argv;
	if (!goldPath || !inputPath || !outputPath) {
		throw new Error("Usage: evaluate.ts <gold-pairs.json> <evaluation-input.json> <metrics.json>");
	}
	const gold = JSON.parse(readFileSync(goldPath, "utf8")) as GoldDocument;
	const input = JSON.parse(readFileSync(inputPath, "utf8")) as EvaluationInput;
	writeFileSync(outputPath, `${JSON.stringify(evaluate(gold, input), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
