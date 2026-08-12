import { describe, expect, it, vi } from "vitest";
import reviewFindingsExtension, {
	assessReviewState,
	createReviewState,
	type RecordFindingInput,
	type ReviewState,
	recordFinding,
	recordRemediation,
	replayReviewEvent,
} from "../examples/extensions/review-findings.js";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "../src/core/extensions/index.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	truncateHead: (content: string) => ({ content, truncated: false }),
}));

const sha = (digit: string) => digit.repeat(40);
const ROOT_CLASS = "BOUNDARY_NORMALIZATION_ESCAPE";
const ABSTRACTION = "assistant content normalization";

function finding(overrides: Partial<RecordFindingInput> = {}): RecordFindingInput {
	return {
		id: "finding-1",
		reviewSha: sha("1"),
		reviewerRole: "codex-correctness",
		severity: "blocking",
		rootClass: ROOT_CLASS,
		affectedAbstraction: ABSTRACTION,
		evidence: "consumer-a.ts tolerates null content locally",
		disposition: "confirmed",
		...overrides,
	};
}

function add(state: ReviewState, input: RecordFindingInput): ReviewState {
	return recordFinding(state, input).state;
}

function remediate(state: ReviewState, remediationSha: string): ReviewState {
	return recordRemediation(state, {
		rootClass: ROOT_CLASS,
		affectedAbstraction: ABSTRACTION,
		remediationSha,
	}).state;
}

describe("review finding recurrence experiment", () => {
	it("scenario A: does not escalate unrelated blocking findings", () => {
		let state = add(createReviewState(), finding());
		state = add(
			state,
			finding({
				id: "finding-2",
				reviewSha: sha("2"),
				rootClass: "AUTHORIZATION_SCOPE_LEAK",
				affectedAbstraction: "tool authorization",
			}),
		);

		const assessment = assessReviewState(state, sha("2"));
		expect(assessment.status).toBe("NO_ARCHITECTURE_ESCALATION");
		expect(assessment.clusters).toHaveLength(2);
	});

	it("scenario B: same-SHA reports do not become recurrence", () => {
		let state = add(createReviewState(), finding());
		state = add(
			state,
			finding({
				id: "finding-2",
				reviewerRole: "claude-architecture",
				evidence: "the same unchanged code is reported independently",
			}),
		);
		const duplicate = recordFinding(state, finding());
		const cluster = assessReviewState(duplicate.state, sha("1")).clusters[0];

		expect(duplicate.duplicate).toBe(true);
		expect(cluster.occurrenceCount).toBe(1);
		expect(cluster.blockingRecurrenceCount).toBe(0);
		expect(duplicate.assessment.status).toBe("NO_ARCHITECTURE_ESCALATION");
	});

	it("scenario C: successful remediation does not escalate", () => {
		const state = remediate(add(createReviewState(), finding()), sha("2"));
		const assessment = assessReviewState(state, sha("3"));

		expect(assessment.status).toBe("NO_ARCHITECTURE_ESCALATION");
		expect(assessment.currentHeadFindings).toHaveLength(0);
		expect(assessment.remediatedFindings).toHaveLength(1);
		expect(assessment.clusters[0].blockingRecurrenceCount).toBe(0);
	});

	it("scenario D: counts one recurrence after remediation", () => {
		let state = remediate(add(createReviewState(), finding()), sha("2"));
		state = add(
			state,
			finding({
				id: "finding-2",
				reviewSha: sha("3"),
				evidence: "consumer-b.ts still assumes content blocks are non-null",
			}),
		);
		const assessment = assessReviewState(state, sha("3"));

		expect(assessment.clusters[0]).toMatchObject({
			occurrenceCount: 2,
			remediationCount: 1,
			blockingRecurrenceCount: 1,
		});
		expect(assessment.status).toBe("NO_ARCHITECTURE_ESCALATION");
	});

	it("scenario E: second recurrence creates a checkpoint and blocks more remediation", () => {
		let state = remediate(add(createReviewState(), finding()), sha("2"));
		state = add(state, finding({ id: "finding-2", reviewSha: sha("3") }));
		state = remediate(state, sha("4"));
		state = add(state, finding({ id: "finding-3", reviewSha: sha("5") }));
		const assessment = assessReviewState(state, sha("5"));

		expect(assessment).toMatchObject({
			status: "ARCHITECTURE_CHECKPOINT",
			implementationRecommendation: "PAUSE_LOCAL_REMEDIATION",
			checkpoint: {
				rootClass: ROOT_CLASS,
				affectedAbstraction: ABSTRACTION,
				occurrences: 3,
				priorRemediations: 2,
				blockingRecurrenceCount: 2,
				requiredNextQuestion: "What shared abstraction allowed these defects to recur?",
				implementationRecommendation: "PAUSE_LOCAL_REMEDIATION",
			},
		});
		expect(() => remediate(state, sha("6"))).toThrow("Architecture checkpoint active");
	});

	it("scenario F: separates an older-SHA finding from current-head evidence", () => {
		const state = add(createReviewState(), finding());
		const assessment = assessReviewState(state, sha("2"));

		expect(assessment.currentHeadFindings).toHaveLength(0);
		expect(assessment.staleFindings).toEqual([expect.objectContaining({ id: "finding-1", reviewSha: sha("1") })]);
	});

	it("scenario G: clusters different manifestations under an explicit shared root", () => {
		let state = add(
			createReviewState(),
			finding({ evidence: "message-view.ts patches one consumer to tolerate null content" }),
		);
		state = remediate(state, sha("2"));
		state = add(
			state,
			finding({
				id: "finding-2",
				reviewSha: sha("3"),
				reviewerRole: "claude-architecture",
				evidence: "message-normalizer.ts leaves a central consumer assuming non-null blocks",
			}),
		);
		const cluster = assessReviewState(state, sha("3")).clusters[0];

		expect(cluster.findingIds).toEqual(["finding-1", "finding-2"]);
		expect(cluster.blockingRecurrenceCount).toBe(1);
	});

	it("rejects same-commit and reused remediation identities", () => {
		const initial = add(createReviewState(), finding());
		expect(() => remediate(initial, sha("1"))).toThrow("must differ from the reviewed SHA");

		let state = remediate(initial, sha("2"));
		state = add(state, finding({ id: "finding-2", reviewSha: sha("3") }));
		expect(() => remediate(state, sha("2"))).toThrow("already recorded for the cluster");
	});

	it("rejects abbreviated SHAs and malformed persisted events", () => {
		expect(() => add(createReviewState(), finding({ reviewSha: "abc123" }))).toThrow("exact lowercase");
		expect(() =>
			replayReviewEvent(createReviewState(), {
				type: "finding",
				finding: finding(),
				unexpected: true,
			}),
		).toThrow("Invalid persisted review event");
	});

	it("fails closed when a persisted event uses an unsupported envelope version", async () => {
		type SessionStartHandler = (event: { type: "session_start" }, ctx: ExtensionContext) => void | Promise<void>;
		let sessionStartHandler: SessionStartHandler | undefined;
		let tool: ToolDefinition | undefined;
		const api = {
			on: (event: string, handler: unknown) => {
				if (event === "session_start") sessionStartHandler = handler as SessionStartHandler;
			},
			registerTool: (candidate: ToolDefinition) => {
				tool = candidate;
			},
		} as unknown as ExtensionAPI;
		reviewFindingsExtension(api);
		if (!sessionStartHandler || !tool) throw new Error("extension hooks were not registered");
		const event = recordFinding(createReviewState(), finding()).event;
		const context = {
			sessionManager: {
				getBranch: () => [
					{
						type: "message",
						message: {
							role: "toolResult",
							toolName: "review_findings",
							details: { version: 2, event },
						},
					},
				],
			} as unknown as ExtensionContext["sessionManager"],
		} as ExtensionContext;
		await sessionStartHandler({ type: "session_start" }, context);

		const result = await tool.execute(
			"call-1",
			{ action: "assess", headSha: sha("1") },
			undefined,
			undefined,
			context,
		);
		expect(result.details).toMatchObject({
			error: "Review state restore failed: Unsupported persisted review event version",
		});
	});

	it("registers a sequential extension tool with machine-readable event details", async () => {
		let tool: ToolDefinition | undefined;
		const api = {
			on: vi.fn(),
			registerTool: (candidate: ToolDefinition) => {
				tool = candidate;
			},
		} as unknown as ExtensionAPI;
		reviewFindingsExtension(api);
		if (!tool) throw new Error("review_findings tool was not registered");

		const result = await tool.execute(
			"call-1",
			{
				action: "record_finding",
				id: "finding-1",
				reviewSha: sha("1"),
				reviewerRole: "codex-correctness",
				severity: "blocking",
				rootClass: ROOT_CLASS,
				affectedAbstraction: ABSTRACTION,
				evidence: "consumer-a.ts assumes non-null content",
				disposition: "confirmed",
			},
			undefined,
			undefined,
			{} as ExtensionContext,
		);

		expect(tool.executionMode).toBe("sequential");
		expect(result.details).toMatchObject({
			version: 1,
			event: { type: "finding", finding: { id: "finding-1", reviewSha: sha("1") } },
			assessment: { status: "NO_ARCHITECTURE_ESCALATION" },
		});
	});
});
