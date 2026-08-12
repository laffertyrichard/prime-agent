# Corpus-validation Run 3 report

## Verdict

`PASS_PENDING_EXACT_SHA_REVIEW`

The frozen corpus contains 22 opaque, randomly ordered atomic manifestations. Blind and provenance corpora are separate. The frozen gold set contains 3 `SAME_ROOT` and 13 `DIFFERENT_ROOT` pairs; no ambiguous case is admitted.

## Audit outcome

- Round 1: Codex failed seven atomicity checks and one overlapping terminal-state set; Claude passed item gates and raised corpus concerns. Ten gate disagreements were adjudicated. One overlapping item was excluded, one distinct authorized item was added, and nine items were rewritten.
- Round 2: Codex identified one duplicate pair; Claude treated the outcomes as distinct. The stricter result was accepted and both items were excluded.
- Every retained item received `PASS` from both Round 2 auditors for atomicity, leakage, and duplicate manifestation.
- No unresolved item disagreement or ambiguous gold case remains.

## Execution boundary

Four model invocations occurred, all using the corpus-validity audit prompt and schema. No invocation requested root classes or pair labels. Classification invocation count and classification output count are both zero. Gold and provenance were withheld, and each reviewer’s output remained hidden from the other until both completed.

Claude Code used canonical primary model `claude-opus-5`; its envelopes also reported auxiliary `claude-fable-5` usage. This is recorded rather than hidden.

## Remaining gate

Independent exact-SHA correctness and architecture reviews must verify the complete instrument, audit adjudications, source excerpts, hashes, execution boundary, and reproduction protocol. The verdict becomes final only after those reviews report no blocker/P1 finding at the exact current SHA.
