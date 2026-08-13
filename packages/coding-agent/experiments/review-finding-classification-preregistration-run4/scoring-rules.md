# Preregistered scoring rules

## Gold boundary

The evaluator accepts only the SHA-256-pinned Run 3 gold file: 3 `SAME_ROOT` pairs and 13 `DIFFERENT_ROOT` pairs. The 16 relations are binary. An `AMBIGUOUS` prediction is an abstention, never a correct binary prediction. No pair is added, removed, relabeled, or reweighted after execution.

## Relation derivation

- Condition A: a pair is predicted `SAME_ROOT` only when its two item labels are equal after formatting-only normalization (Unicode NFKC, trim, uppercase, replace each non-alphanumeric run with `_`, trim outer `_`). Otherwise it is `DIFFERENT_ROOT`.
- Condition B: use the explicit pair decision. Label-derived Condition B relations are diagnostic only and cannot change the gate.
- Every pair has unit weight. The two reviewers are scored separately.

## Exact-count gates

A reviewer passes a condition only with all 3/3 positive pairs correct and at least 12/13 negative pairs correct. Thus a missed positive always fails; at most one negative false positive or abstention is tolerated.

Condition A passes only if:

1. both reviewers pass the reviewer gate;
2. their derived pair decisions agree on at least 15/16 pairs; and
3. their normalized item labels agree on at least 18/22 items.

Condition B passes only if:

1. both reviewers pass the reviewer gate; and
2. their explicit decisions agree on at least 15/16 pairs, with `AMBIGUOUS` treated as a distinct decision.

No percentage threshold from Run 2 is inherited. Exact counts are authoritative; displayed rates are descriptive projections of those counts.

## Conclusion rule

1. If Condition A passes: `EXTENSION_SUFFICIENT_WITH_EXPLICIT_CLASSES`.
2. Otherwise, if Condition B passes: `EXTENSION_SUFFICIENT_WITH_RUBRIC_OR_HUMAN_GATE`.
3. Otherwise: `CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED`.

Classification error cannot establish that a Prime core hook is required. No architecture or publication decision is automated by this evaluator.

## Cross-arm comparison

Run A is evaluated and frozen before Run B is authorized. After Run B raw outputs are frozen, compare arms descriptively using Claude's per-pair correction/regression discordance, deltas in exact correct-positive and correct-negative counts, and deltas in item-label and reviewer agreement. Codex is a procedural replication control. Do not pool arms, tune prompts, change gates, or claim statistical significance. If Run B reports auxiliary `claude-fable-5` use, attribute the comparison to the recorded effective composition rather than Opus 5 alone.
