import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreregistration } from "./validate-preregistration.js";

describe("Run 4 preregistration integrity", () => {
	it("pins the complete no-execution instrument", () => {
		const experimentRoot = resolve(import.meta.dirname);
		const repositoryRoot = resolve(experimentRoot, "../../../..");
		expect(() => validatePreregistration(experimentRoot, repositoryRoot)).not.toThrow();
	});
});
