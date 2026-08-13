import { describe, expect, it, vi } from "vitest";
import { calculateBinaryMetrics, normalizeRootClass, replayPair } from "./evaluate.js";
import { extractClaude, extractCodex } from "./normalize-results.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	truncateHead: (content: string) => ({ content, truncated: false }),
}));

describe("Run 2 evaluator", () => {
	it("calculates pair precision, recall, F1, and checkpoint error rates", () => {
		const metrics = calculateBinaryMetrics(
			["SAME_ROOT", "SAME_ROOT", "DIFFERENT_ROOT", "DIFFERENT_ROOT", "AMBIGUOUS"],
			["SAME_ROOT", "DIFFERENT_ROOT", "SAME_ROOT", "DIFFERENT_ROOT", "SAME_ROOT"],
		);
		expect(metrics).toEqual({
			tp: 1,
			fp: 1,
			tn: 1,
			fn: 1,
			precision: 0.5,
			recall: 0.5,
			f1: 0.5,
			falseCheckpointRate: 0.5,
			missedCheckpointRate: 0.5,
		});
	});

	it("normalizes formatting without merging semantic label differences", () => {
		expect(normalizeRootClass(" identity-by string ")).toBe("IDENTITY_BY_STRING");
		expect(normalizeRootClass("IDENTITY_SCOPE")).not.toBe(normalizeRootClass("IDENTITY_VALIDITY"));
	});

	it("replays classifications through the unchanged Run 1 projector", () => {
		expect(replayPair("SHARED_ARCHITECTURAL_ROOT", "SHARED_ARCHITECTURAL_ROOT")).toBe(true);
		expect(replayPair("FIRST_ARCHITECTURAL_ROOT", "SECOND_ARCHITECTURAL_ROOT")).toBe(false);
	});
	it("extracts structured Codex and Claude outputs without semantic transformation", () => {
		const result = { condition: "A", classifications: [] };
		expect(extractCodex(result)).toEqual(result);
		expect(extractClaude({ structured_output: result })).toEqual(result);
		expect(extractClaude({ result: JSON.stringify(result) })).toEqual(result);
	});
});
