/**
 * Experimental review-finding recurrence detector.
 *
 * State is an event log stored in tool-result details. Classification remains
 * explicit; the extension only makes recurrence orchestration deterministic.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import {
	type AgentToolResult,
	type ExtensionAPI,
	type ExtensionContext,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const SHA_PATTERN = "^[0-9a-f]{40}$";
const ROOT_CLASS_PATTERN = "^[A-Z][A-Z0-9_]*$";
const REQUIRED_NEXT_QUESTION = "What shared abstraction allowed these defects to recur?";
const ShaSchema = Type.String({ pattern: SHA_PATTERN });
const RootClassSchema = Type.String({ pattern: ROOT_CLASS_PATTERN });
const TextSchema = Type.String({ minLength: 1 });
const SeveritySchema = StringEnum(["blocking", "non_blocking"] as const);
const InitialDispositionSchema = StringEnum(["confirmed", "rejected"] as const);

const StoredFindingSchema = Type.Object(
	{
		id: TextSchema,
		reviewSha: ShaSchema,
		reviewerRole: TextSchema,
		severity: SeveritySchema,
		rootClass: RootClassSchema,
		affectedAbstraction: TextSchema,
		evidence: TextSchema,
		disposition: InitialDispositionSchema,
	},
	{ additionalProperties: false },
);
const FindingEventSchema = Type.Object(
	{ type: Type.Literal("finding"), finding: StoredFindingSchema },
	{ additionalProperties: false },
);
const RemediationEventSchema = Type.Object(
	{
		type: Type.Literal("remediation"),
		rootClass: RootClassSchema,
		remediationSha: ShaSchema,
		findingIds: Type.Array(TextSchema, { minItems: 1 }),
	},
	{ additionalProperties: false },
);
const ReviewEventSchema = Type.Union([FindingEventSchema, RemediationEventSchema]);

export type StoredFinding = Static<typeof StoredFindingSchema>;
export type ReviewFindingSeverity = StoredFinding["severity"];
export type InitialFindingDisposition = StoredFinding["disposition"];
export type FindingEvent = Static<typeof FindingEventSchema>;
export type RemediationEvent = Static<typeof RemediationEventSchema>;
export type ReviewEvent = Static<typeof ReviewEventSchema>;
export type ReviewFinding = Omit<StoredFinding, "disposition"> & {
	disposition: InitialFindingDisposition | "remediated";
};

export interface FindingCluster {
	rootClass: string;
	affectedAbstraction: string;
	occurrenceCount: number;
	remediationCount: number;
	blockingRecurrenceCount: number;
	findingIds: string[];
}

export interface ArchitectureCheckpoint {
	rootClass: string;
	affectedAbstraction: string;
	occurrences: number;
	priorRemediations: number;
	blockingRecurrenceCount: number;
	evidence: Array<Pick<StoredFinding, "id" | "reviewSha" | "reviewerRole" | "evidence">>;
	requiredNextQuestion: typeof REQUIRED_NEXT_QUESTION;
	implementationRecommendation: "PAUSE_LOCAL_REMEDIATION";
}

export interface ReviewState {
	events: ReviewEvent[];
}

export interface ReviewAssessment {
	status: "NO_ARCHITECTURE_ESCALATION" | "ARCHITECTURE_CHECKPOINT";
	implementationRecommendation: "CONTINUE_REVIEW" | "PAUSE_LOCAL_REMEDIATION";
	headSha: string;
	currentHeadFindings: ReviewFinding[];
	staleFindings: ReviewFinding[];
	remediatedFindings: ReviewFinding[];
	rejectedFindings: ReviewFinding[];
	clusters: FindingCluster[];
	checkpoint?: ArchitectureCheckpoint;
}

export interface RecordFindingInput {
	id: string;
	reviewSha: string;
	reviewerRole: string;
	severity: ReviewFindingSeverity;
	rootClass: string;
	affectedAbstraction: string;
	evidence: string;
	disposition: InitialFindingDisposition;
}

export interface RecordRemediationInput {
	rootClass: string;
	remediationSha: string;
}

export interface ReviewTransition {
	state: ReviewState;
	assessment: ReviewAssessment;
	event?: ReviewEvent;
	duplicate: boolean;
}

export function createReviewState(): ReviewState {
	return { events: [] };
}

function normalizedText(value: string, field: string): string {
	const normalized = value.trim().replace(/\s+/g, " ");
	if (!normalized) throw new Error(`${field} must not be empty`);
	return normalized;
}

function exactSha(value: string, field: string): string {
	if (!new RegExp(SHA_PATTERN).test(value)) {
		throw new Error(`${field} must be an exact lowercase 40-character commit SHA`);
	}
	return value;
}

function normalizedRootClass(value: string): string {
	if (!new RegExp(ROOT_CLASS_PATTERN).test(value)) {
		throw new Error("rootClass must use normalized UPPER_SNAKE_CASE");
	}
	return value;
}

function cloneEvent(event: ReviewEvent): ReviewEvent {
	return event.type === "finding"
		? { type: "finding", finding: { ...event.finding } }
		: { ...event, findingIds: [...event.findingIds] };
}

function materializedFindings(state: ReviewState): ReviewFinding[] {
	const remediatedIds = new Set(
		state.events.flatMap((event) => (event.type === "remediation" ? event.findingIds : [])),
	);
	return state.events.flatMap((event) => {
		if (event.type !== "finding") return [];
		return [
			{
				...event.finding,
				disposition: remediatedIds.has(event.finding.id) ? "remediated" : event.finding.disposition,
			},
		];
	});
}

export function clusterFindings(state: ReviewState): FindingCluster[] {
	const groups = new Map<string, ReviewEvent[]>();
	for (const event of state.events) {
		if (
			event.type === "finding" &&
			(event.finding.severity !== "blocking" || event.finding.disposition === "rejected")
		) {
			continue;
		}
		const rootClass = event.type === "finding" ? event.finding.rootClass : event.rootClass;
		groups.set(rootClass, [...(groups.get(rootClass) ?? []), event]);
	}

	const clusters: FindingCluster[] = [];
	for (const [rootClass, events] of groups) {
		const seenReviewShas = new Set<string>();
		const findingIds: string[] = [];
		let occurrenceCount = 0;
		let remediationCount = 0;
		let blockingRecurrenceCount = 0;
		let remediatedSinceOccurrence = false;
		for (const event of events) {
			if (event.type === "remediation") {
				remediationCount += 1;
				remediatedSinceOccurrence = occurrenceCount > 0;
				continue;
			}
			findingIds.push(event.finding.id);
			if (seenReviewShas.has(event.finding.reviewSha)) continue;
			seenReviewShas.add(event.finding.reviewSha);
			occurrenceCount += 1;
			if (remediatedSinceOccurrence) {
				blockingRecurrenceCount += 1;
				remediatedSinceOccurrence = false;
			}
		}
		const affectedAbstraction = Array.from(
			new Set(events.flatMap((event) => (event.type === "finding" ? [event.finding.affectedAbstraction] : []))),
		).join(", ");
		clusters.push({
			rootClass,
			affectedAbstraction,
			occurrenceCount,
			remediationCount,
			blockingRecurrenceCount,
			findingIds,
		});
	}
	return clusters;
}

function checkpointForState(state: ReviewState): ArchitectureCheckpoint | undefined {
	const cluster = clusterFindings(state).find((candidate) => candidate.blockingRecurrenceCount >= 2);
	if (!cluster) return undefined;
	const evidence = state.events.flatMap((event) => {
		if (
			event.type !== "finding" ||
			event.finding.severity !== "blocking" ||
			event.finding.disposition === "rejected" ||
			event.finding.rootClass !== cluster.rootClass
		) {
			return [];
		}
		const { id, reviewSha, reviewerRole, evidence: findingEvidence } = event.finding;
		return [{ id, reviewSha, reviewerRole, evidence: findingEvidence }];
	});
	return {
		rootClass: cluster.rootClass,
		affectedAbstraction: cluster.affectedAbstraction,
		occurrences: cluster.occurrenceCount,
		priorRemediations: cluster.remediationCount,
		blockingRecurrenceCount: cluster.blockingRecurrenceCount,
		evidence,
		requiredNextQuestion: REQUIRED_NEXT_QUESTION,
		implementationRecommendation: "PAUSE_LOCAL_REMEDIATION",
	};
}

function stateWithEvents(events: ReviewEvent[]): ReviewState {
	return { events: events.map(cloneEvent) };
}

export function assessReviewState(state: ReviewState, headSha: string): ReviewAssessment {
	const exactHeadSha = exactSha(headSha, "headSha");
	const currentHeadFindings: ReviewFinding[] = [];
	const staleFindings: ReviewFinding[] = [];
	const remediatedFindings: ReviewFinding[] = [];
	const rejectedFindings: ReviewFinding[] = [];
	for (const finding of materializedFindings(state)) {
		if (finding.disposition === "rejected") rejectedFindings.push(finding);
		else if (finding.disposition === "remediated") remediatedFindings.push(finding);
		else if (finding.reviewSha === exactHeadSha) currentHeadFindings.push(finding);
		else staleFindings.push(finding);
	}
	const checkpoint = checkpointForState(state);
	return {
		status: checkpoint ? "ARCHITECTURE_CHECKPOINT" : "NO_ARCHITECTURE_ESCALATION",
		implementationRecommendation: checkpoint ? "PAUSE_LOCAL_REMEDIATION" : "CONTINUE_REVIEW",
		headSha: exactHeadSha,
		currentHeadFindings,
		staleFindings,
		remediatedFindings,
		rejectedFindings,
		clusters: clusterFindings(state),
		...(checkpoint ? { checkpoint } : {}),
	};
}

export function recordFinding(state: ReviewState, input: RecordFindingInput): ReviewTransition {
	const event: FindingEvent = {
		type: "finding",
		finding: {
			id: normalizedText(input.id, "id"),
			reviewSha: exactSha(input.reviewSha, "reviewSha"),
			reviewerRole: normalizedText(input.reviewerRole, "reviewerRole"),
			severity: input.severity,
			rootClass: normalizedRootClass(input.rootClass),
			affectedAbstraction: normalizedText(input.affectedAbstraction, "affectedAbstraction"),
			evidence: normalizedText(input.evidence, "evidence"),
			disposition: input.disposition,
		},
	};
	const existing = state.events.find(
		(candidate): candidate is FindingEvent =>
			candidate.type === "finding" && candidate.finding.id === event.finding.id,
	);
	if (existing) {
		if (JSON.stringify(existing) !== JSON.stringify(event)) {
			throw new Error(`finding id ${event.finding.id} already identifies different evidence`);
		}
		return { state, assessment: assessReviewState(state, event.finding.reviewSha), duplicate: true };
	}
	const nextState = stateWithEvents([...state.events, event]);
	return {
		state: nextState,
		assessment: assessReviewState(nextState, event.finding.reviewSha),
		event,
		duplicate: false,
	};
}

export function recordRemediation(state: ReviewState, input: RecordRemediationInput): ReviewTransition {
	if (checkpointForState(state)) {
		throw new Error("Architecture checkpoint active: PAUSE_LOCAL_REMEDIATION");
	}
	const rootClass = normalizedRootClass(input.rootClass);
	const remediationSha = exactSha(input.remediationSha, "remediationSha");
	if (
		state.events.some(
			(event) =>
				event.type === "remediation" && event.rootClass === rootClass && event.remediationSha === remediationSha,
		)
	) {
		throw new Error("This remediation SHA is already recorded for the root class");
	}
	const findings = materializedFindings(state).filter(
		(finding) =>
			finding.rootClass === rootClass && finding.severity === "blocking" && finding.disposition === "confirmed",
	);
	if (findings.length === 0) {
		throw new Error("No confirmed blocking findings in this root class require remediation");
	}
	if (findings.some((finding) => finding.reviewSha === remediationSha)) {
		throw new Error("remediationSha must differ from the reviewed SHA it remediates");
	}
	const event: RemediationEvent = {
		type: "remediation",
		rootClass,
		remediationSha,
		findingIds: findings.map((finding) => finding.id),
	};
	const nextState = stateWithEvents([...state.events, event]);
	return {
		state: nextState,
		assessment: assessReviewState(nextState, remediationSha),
		event,
		duplicate: false,
	};
}

export function replayReviewEvent(state: ReviewState, value: unknown): ReviewState {
	if (!Value.Check(ReviewEventSchema, value)) throw new Error("Invalid persisted review event");
	let transition: ReviewTransition;
	if (value.type === "finding") {
		transition = recordFinding(state, value.finding);
	} else {
		const expectedFindingIds = materializedFindings(state)
			.filter(
				(finding) =>
					finding.rootClass === value.rootClass &&
					finding.severity === "blocking" &&
					finding.disposition === "confirmed",
			)
			.map((finding) => finding.id);
		if (JSON.stringify(expectedFindingIds) !== JSON.stringify(value.findingIds)) {
			throw new Error("Persisted remediation references do not match the open cluster");
		}
		transition = recordRemediation(state, value);
	}
	if (JSON.stringify(transition.event) !== JSON.stringify(value)) {
		throw new Error("Persisted review event is duplicate or non-canonical");
	}
	return transition.state;
}

function formatAssessment(assessment: ReviewAssessment): string {
	const output = assessment.checkpoint
		? [
				"ARCHITECTURE_CHECKPOINT",
				`Root defect class: ${assessment.checkpoint.rootClass}`,
				`Affected abstraction: ${assessment.checkpoint.affectedAbstraction}`,
				`Occurrences: ${assessment.checkpoint.occurrences}`,
				`Prior remediations: ${assessment.checkpoint.priorRemediations}`,
				"Evidence:",
				...assessment.checkpoint.evidence.map(
					(item) => `- ${item.reviewSha} ${item.reviewerRole}: ${item.evidence}`,
				),
				`Required next question: "${assessment.checkpoint.requiredNextQuestion}"`,
				`Implementation recommendation: ${assessment.checkpoint.implementationRecommendation}`,
			].join("\n")
		: `${assessment.status}\nCurrent-head findings: ${assessment.currentHeadFindings.length}\nStale findings: ${assessment.staleFindings.length}`;
	const truncated = truncateHead(output);
	return truncated.truncated ? `${truncated.content}\n[Review output truncated]` : output;
}

const ReviewFindingToolParams = Type.Object(
	{
		action: StringEnum(["record_finding", "record_remediation", "assess"] as const),
		id: Type.Optional(TextSchema),
		reviewSha: Type.Optional(ShaSchema),
		reviewerRole: Type.Optional(TextSchema),
		severity: Type.Optional(SeveritySchema),
		rootClass: Type.Optional(RootClassSchema),
		affectedAbstraction: Type.Optional(TextSchema),
		evidence: Type.Optional(TextSchema),
		disposition: Type.Optional(InitialDispositionSchema),
		remediationSha: Type.Optional(ShaSchema),
		headSha: Type.Optional(ShaSchema),
	},
	{ additionalProperties: false },
);

function required<T>(value: T | undefined, name: string): T {
	if (value === undefined) throw new Error(`${name} is required for this action`);
	return value;
}

interface ReviewToolDetails {
	version: 1;
	event?: ReviewEvent;
	assessment?: ReviewAssessment;
	error?: string;
}

export default function reviewFindingsExtension(pi: ExtensionAPI) {
	let state = createReviewState();
	let restoreError: string | undefined;
	const reconstructState = (ctx: ExtensionContext) => {
		state = createReviewState();
		restoreError = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (
				entry.type !== "message" ||
				entry.message.role !== "toolResult" ||
				entry.message.toolName !== "review_findings"
			) {
				continue;
			}
			const details = entry.message.details;
			if (!details || typeof details !== "object" || !("event" in details) || details.event === undefined) continue;
			if (!("version" in details) || details.version !== 1) {
				restoreError = "Unsupported persisted review event version";
				return;
			}
			try {
				state = replayReviewEvent(state, details.event);
			} catch (error) {
				restoreError = error instanceof Error ? error.message : String(error);
				return;
			}
		}
	};
	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));
	pi.registerTool({
		name: "review_findings",
		label: "Review Findings",
		description:
			"Record exact-SHA review findings and remediation, or assess deterministic recurrence at an exact head SHA.",
		promptSnippet: "Stop local remediation when a confirmed blocking root class recurs twice after remediation",
		promptGuidelines: [
			"Use an explicit UPPER_SNAKE_CASE root class; recurrence identity uses that class while affected abstraction remains descriptive.",
			"Record reproduced findings as confirmed and falsified findings as rejected.",
			"A SHA proves identity only; independently verify ancestry, reviewer authority, and evidence validity.",
		],
		parameters: ReviewFindingToolParams,
		executionMode: "sequential",
		async execute(_toolCallId, params): Promise<AgentToolResult<ReviewToolDetails>> {
			try {
				if (restoreError) throw new Error(`Review state restore failed: ${restoreError}`);
				let transition: ReviewTransition;
				if (params.action === "record_finding") {
					transition = recordFinding(state, {
						id: required(params.id, "id"),
						reviewSha: required(params.reviewSha, "reviewSha"),
						reviewerRole: required(params.reviewerRole, "reviewerRole"),
						severity: required(params.severity, "severity"),
						rootClass: required(params.rootClass, "rootClass"),
						affectedAbstraction: required(params.affectedAbstraction, "affectedAbstraction"),
						evidence: required(params.evidence, "evidence"),
						disposition: required(params.disposition, "disposition"),
					});
				} else if (params.action === "record_remediation") {
					transition = recordRemediation(state, {
						rootClass: required(params.rootClass, "rootClass"),
						remediationSha: required(params.remediationSha, "remediationSha"),
					});
				} else {
					const assessment = assessReviewState(state, required(params.headSha, "headSha"));
					return {
						content: [{ type: "text", text: formatAssessment(assessment) }],
						details: { version: 1, assessment } satisfies ReviewToolDetails,
					};
				}
				state = transition.state;
				return {
					content: [{ type: "text", text: formatAssessment(transition.assessment) }],
					details: {
						version: 1,
						event: transition.event,
						assessment: transition.assessment,
					} satisfies ReviewToolDetails,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { version: 1, error: message } satisfies ReviewToolDetails,
				};
			}
		},
	});
}
