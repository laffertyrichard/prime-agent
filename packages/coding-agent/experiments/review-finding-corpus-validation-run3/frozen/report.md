# Corpus-validation Run 3 report

## Verdict

`PASS`

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

The first exact-SHA reviews found P1 gaps in the later-run prompt plan, gold adequacy/rationales, and one adjudication record. All findings were accepted and remediated without changing the blind corpus or audit outputs. Independent Codex and Claude re-reviews at `522037cc087059bea9bb8fe24141a132298a8be5` both reported `NO_BLOCKER_OR_P1_FINDINGS` and approved the gate as `PASS`.

The gold set is a bounded feasibility instrument: 3 positive and 13 negative pairs cannot estimate the prior percentage tolerances. Run 2 thresholds are not inherited. A later no-execution preregistration must freeze new classification prompts, attainable exact-count criteria, and uncertainty reporting before either model arm.


## Limitations

Gold relations are single-operator adjudications with pair-specific rationales; they were withheld from blind item auditors to preserve blindness. The corpus is a bounded feasibility instrument, not a prevalence estimate. Claude Code audit envelopes reported both `claude-opus-5` and substantial `claude-fable-5` auxiliary usage; later preregistration must constrain effective model composition rather than relying only on the requested selector.

Classification remains unauthorized.
