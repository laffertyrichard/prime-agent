import { describe, expect, it } from "vitest";
import { normalizeRootClass, scoreRelations, validateModelComposition, wilsonInterval, type ExecutionMetadata } from "./evaluate.js";
import { extractClaude, extractCodex, normalize } from "./normalize-results.js";

const PROMPTS = {
	A: "195cdf794aa2622f006e98dda49e9859a41b52d609996d3d10c22ee3c27b1357",
	B: "57ee2b3a0728fd1678fcdd8fcfe0b38f3b6c2b7ec09fbaf9a3e630648cf4a89e",
} as const;
const SCHEMAS = {
	A: "2d9cfaaff9402f16ef0d70c389386a68fddb63b300f416971b83d392bf16b616",
	B: "38d3a1d238637fedf867936013817772ea822a57d2e89516974347a96b1af36e",
} as const;

function metadata(arm: "RUN_A_CONTROL" | "RUN_B_OPUS5", claudeModels: string[]): ExecutionMetadata {
	const invocations = (["A", "B"] as const).flatMap((condition) =>
		(["codex", "claude"] as const).map((reviewer) => {
			const models = reviewer === "codex" ? ["gpt-5.6-sol"] : claudeModels;
			return {
				condition,
				reviewer,
				tool: reviewer === "codex" ? "codex-cli" : "Claude Code",
				toolVersion: reviewer === "codex" ? "0.146.0" : "2.1.228",
				requestedModel: reviewer === "codex" ? "gpt-5.6-sol" : arm === "RUN_A_CONTROL" ? "claude-opus-4-6" : "claude-opus-5",
				exitCode: 0,
				promptSha256: PROMPTS[condition],
				responseSchemaSha256: SCHEMAS[condition],
				rawArtifact: `raw/${condition}-${reviewer}.json`,
				rawArtifactSha256: "a".repeat(64),
				...(reviewer === "codex"
					? { eventsArtifact: `raw/${condition}-codex-events.jsonl`, eventsArtifactSha256: "c".repeat(64) }
					: {}),
				modelUsage: models.map((model) => ({ model, canonicalModel: model, provider: "firstParty", inputTokens: 1, outputTokens: 1 })),
			};
		}),
	);
	return {
		schemaVersion: 1,
		arm,
		sourceSha: "bd247656aeeabea6b347bc892c0bfb9236fd7663",
		preregistrationSha: "b".repeat(40),
		corpusVersion: "frozen-1",
		blindCorpusSha256: "b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b",
		goldPairsSha256: "5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b",
		outputsMutuallyHiddenUntilFrozen: true,
		invocations,
	};
}

describe("Run 4 preregistered evaluator", () => {
	it("uses formatting-only root-class normalization", () => {
		expect(normalizeRootClass(" identity-by string ")).toBe("IDENTITY_BY_STRING");
		expect(normalizeRootClass("IDENTITY_SCOPE")).not.toBe(normalizeRootClass("IDENTITY_VALIDITY"));
	});

	it("scores abstentions separately from binary errors", () => {
		const gold: Array<"SAME_ROOT" | "DIFFERENT_ROOT"> = [
			"SAME_ROOT",
			"SAME_ROOT",
			"SAME_ROOT",
			...Array.from({ length: 13 }, () => "DIFFERENT_ROOT" as const),
		];
		const predicted: Array<"SAME_ROOT" | "DIFFERENT_ROOT" | "AMBIGUOUS"> = [
			"SAME_ROOT",
			"DIFFERENT_ROOT",
			"AMBIGUOUS",
			"SAME_ROOT",
			"AMBIGUOUS",
			...Array.from({ length: 11 }, () => "DIFFERENT_ROOT" as const),
		];
		expect(scoreRelations(gold, predicted)).toMatchObject({
			correctSame: 1,
			missedSame: 1,
			ambiguousSame: 1,
			correctDifferent: 11,
			falseSame: 1,
			ambiguousDifferent: 1,
			correct: 12,
			total: 16,
		});
	});

	it("reports bounded Wilson intervals", () => {
		expect(wilsonInterval(3, 3)).toEqual(expect.objectContaining({ upper: 1 }));
		expect(wilsonInterval(3, 3).lower).toBeCloseTo(0.4385, 3);
		expect(wilsonInterval(12, 13).upper).toBeLessThanOrEqual(1);
	});

	it("accepts only preregistered effective model compositions", () => {
		expect(validateModelComposition(metadata("RUN_A_CONTROL", ["claude-opus-4-6"])).effectiveModels.claude).toEqual(["claude-opus-4-6"]);
		expect(validateModelComposition(metadata("RUN_B_OPUS5", ["claude-opus-5", "claude-fable-5"])).effectiveModels.claude).toEqual([
			"claude-fable-5",
			"claude-opus-5",
		]);
		expect(() => validateModelComposition(metadata("RUN_B_OPUS5", ["claude-opus-5", "unknown-helper"]))).toThrow(
			"effective model composition is not allowed",
		);
	});

	it("normalizes envelopes without semantic transformation", () => {
		const a = { condition: "A", classifications: [] };
		const b = { condition: "B", classifications: [], pairs: [] };
		expect(extractCodex(a, "A")).toBe(a);
		expect(extractClaude({ structured_output: b }, "B")).toBe(b);
		expect(normalize("RUN_A_CONTROL", a, { structured_output: a }, b, { result: JSON.stringify(b) }).arm).toBe("RUN_A_CONTROL");
	});
});
