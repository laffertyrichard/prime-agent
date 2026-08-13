import { describe, expect, it } from "vitest";
import { compareWithOriginal, determineFinalDecision } from "./adjudication-lib.js";

describe("blind final-adjudication rule", () => {
	it("confirms only unanimous binary decisions", () => {
		expect(determineFinalDecision("SAME_ROOT", "SAME_ROOT")).toEqual({ finalDecision: "SAME_ROOT", status: "CONFIRMED_BINARY" });
		expect(determineFinalDecision("DIFFERENT_ROOT", "DIFFERENT_ROOT")).toEqual({ finalDecision: "DIFFERENT_ROOT", status: "CONFIRMED_BINARY" });
	});

	it("leaves disagreement and every abstention unresolved", () => {
		expect(determineFinalDecision("SAME_ROOT", "DIFFERENT_ROOT")).toEqual({ finalDecision: null, status: "UNRESOLVED_DISAGREEMENT" });
		expect(determineFinalDecision("ABSTAIN", "SAME_ROOT")).toEqual({ finalDecision: null, status: "UNRESOLVED_ABSTENTION" });
		expect(determineFinalDecision("DIFFERENT_ROOT", "ABSTAIN")).toEqual({ finalDecision: null, status: "UNRESOLVED_ABSTENTION" });
		expect(determineFinalDecision("ABSTAIN", "ABSTAIN")).toEqual({ finalDecision: null, status: "UNRESOLVED_ABSTENTION" });
	});

	it("compares only a confirmed binary result with the original", () => {
		expect(compareWithOriginal("SAME_ROOT", "SAME_ROOT")).toBe("AGREES_WITH_ORIGINAL");
		expect(compareWithOriginal("SAME_ROOT", "DIFFERENT_ROOT")).toBe("CONFIRMED_GOLD_CHANGE");
		expect(compareWithOriginal(null, "DIFFERENT_ROOT")).toBe("UNRESOLVED");
	});
});
