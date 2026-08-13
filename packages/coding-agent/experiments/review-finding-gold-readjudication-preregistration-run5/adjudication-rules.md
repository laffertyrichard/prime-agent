# Frozen adjudication rules

## Scope

Both independent adjudicators assess all 16 cases from the byte-identical blind packet. No case is selected because of the Run A failure. The original relations, rationales, Run A outputs and metrics, and all prior reviewer decisions remain outside both adjudicator environments.

## Relation criterion

`SAME_ROOT` is valid only when one coherent architectural remediation plausibly addresses both manifestations. Coordinated edits count as one remediation only when they enforce one architectural invariant at one responsibility boundary. A shared module, broad topic, upstream event, causal chain, or release bundle is insufficient.

`DIFFERENT_ROOT` applies when both manifestations require independent remediation decisions. Causal closeness does not override that rule. `ABSTAIN` applies whenever the blinded text cannot support either binary decision without assumptions about withheld source context.

## Causal proximity

Each response separately reports `CLOSE`, `INTERMEDIATE`, `DISTANT`, or `UNCERTAIN`. This field describes causal adjacency only. It neither determines nor breaks ties for the root relation. The finalizer preserves proximity and rationales in raw responses but does not use them to derive the final relation.

## Confidence

Each response reports confidence on the closed interval 0 through 1. Confidence is descriptive only: it is preserved and summarized as the two values and their minimum and maximum. It does not weight a vote, resolve a disagreement, convert an abstention, exclude a case, or alter a final decision.

## Deterministic final adjudication

For each case, the finalizer uses only the two schema-valid `decision` values:

1. If both are `SAME_ROOT`, final decision is `SAME_ROOT`.
2. If both are `DIFFERENT_ROOT`, final decision is `DIFFERENT_ROOT`.
3. Every disagreement and every case containing at least one `ABSTAIN` is `UNRESOLVED`.

No human tie-break, third-model tie-break, confidence threshold, rationale interpretation, selective retry, majority construction, or post hoc prompt change is allowed. An unresolved case retains its original gold relation for any reproduction of Run A and is explicitly reported as unresolved.

## Comparison with frozen gold

Only after both raw outputs are complete, mutually hidden, hash-frozen, identity-validated, and finalized may the operator join opaque case IDs to original pair IDs through `sealed/case-map.json` and compare final decisions with the immutable original gold file.

- A unanimous binary final decision equal to the original relation is `AGREES_WITH_ORIGINAL`.
- A unanimous binary final decision opposite the original relation is `CONFIRMED_GOLD_CHANGE`.
- `UNRESOLVED` remains `UNRESOLVED`; it is not a gold change.

The finalizer must cover every mapped source pair exactly once. It fails closed rather than emitting a partial result.
