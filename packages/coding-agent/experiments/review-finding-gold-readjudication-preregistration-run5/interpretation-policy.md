# Frozen Run A interpretation policy

Run A is immutable evidence at `f1450e95a197b91998550566e36484f046a2a8ed`. Its corpus, prompts, raw outputs, normalized outputs, metrics, reviewer decisions, conclusion, and `CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED` result are never rewritten, replaced, or described as retrospectively passed.

Only after separately authorized adjudication and frozen blind finalization may confirmed changes affect interpretation:

1. Preserve the original Run A result against the original gold as the sole preregistered result.
2. Record each unanimous opposite relation as `CONFIRMED_GOLD_CHANGE` in a separate comparison artifact. Do not edit Run 3 gold or any Run A artifact.
3. Treat every disagreement or abstention as unresolved reference uncertainty, not a relabel, exclusion, or fallback to the original relation.
4. Under separate result-generation authorization, a descriptive impact report may identify which frozen Run A reviewer predictions change match status under the confirmed binary decisions. It must pin the re-adjudication preregistration SHA, response hashes, blind-final hash, comparison hash, changed pair IDs, and unresolved pair IDs.
5. Do not rerun or reinterpret Run A's frozen exact-count gate against a revised relation vector. The gate was preregistered for 3 positive and 13 negative pairs, so changed or unresolved relations alter its denominators and attainable criteria. Any revised operational gold and confirmatory scoring require a new corpus version and a new preregistered experiment.

Interpretation rules:

- No confirmed changes and no unresolved cases: Run A's conclusion remains unchanged, with additional independent support for the original reference labels.
- One or more confirmed changes: Run A remains a valid historical failure against the original gold, but its substantive conclusion is reference-label-sensitive. Report descriptive prediction impacts only; do not claim a corrected pass or failure.
- Any unresolved case: the binary gold set is not fully revalidated. Disclose that uncertainty and do not score, impute, or selectively re-adjudicate the case.

This procedure cannot authorize Run B. Run B remains on hold unless separately authorized after review of completed re-adjudication evidence.
