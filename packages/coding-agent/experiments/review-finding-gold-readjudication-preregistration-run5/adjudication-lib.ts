export type BinaryRelation = "SAME_ROOT" | "DIFFERENT_ROOT";
export type AdjudicatorDecision = BinaryRelation | "ABSTAIN";
export type FinalDecision = BinaryRelation | null;
export type Comparison = "AGREES_WITH_ORIGINAL" | "CONFIRMED_GOLD_CHANGE" | "UNRESOLVED";
export type FinalStatus = "CONFIRMED_BINARY" | "UNRESOLVED_DISAGREEMENT" | "UNRESOLVED_ABSTENTION";

export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertExactKeys(value: Record<string, unknown>, expected: string[], context: string): void {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	assert(JSON.stringify(actual) === JSON.stringify(wanted), `${context} keys mismatch`);
}

export function determineFinalDecision(left: AdjudicatorDecision, right: AdjudicatorDecision): { finalDecision: FinalDecision; status: FinalStatus } {
	if (left === "ABSTAIN" || right === "ABSTAIN") return { finalDecision: null, status: "UNRESOLVED_ABSTENTION" };
	if (left !== right) return { finalDecision: null, status: "UNRESOLVED_DISAGREEMENT" };
	return { finalDecision: left, status: "CONFIRMED_BINARY" };
}

export function compareWithOriginal(finalDecision: FinalDecision, original: BinaryRelation): Comparison {
	if (finalDecision === null) return "UNRESOLVED";
	return finalDecision === original ? "AGREES_WITH_ORIGINAL" : "CONFIRMED_GOLD_CHANGE";
}
