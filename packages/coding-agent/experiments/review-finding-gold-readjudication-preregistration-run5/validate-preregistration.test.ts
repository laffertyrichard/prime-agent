import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePreregistration } from "./validate-preregistration.js";

describe("Run 5 blind re-adjudication preregistration", () => {
	it("pins the complete no-execution and blinding boundary", () => {
		const experimentRoot = resolve(import.meta.dirname);
		const repositoryRoot = resolve(experimentRoot, "../../../..");
		expect(() => validatePreregistration(experimentRoot, repositoryRoot)).not.toThrow();
	});
});
