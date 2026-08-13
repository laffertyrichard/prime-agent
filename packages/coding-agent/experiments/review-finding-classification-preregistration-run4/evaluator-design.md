# Evaluator design

`evaluate.ts` is a fail-closed, deterministic evaluator. It accepts the frozen Run 3 `gold-pairs.json`, normalized reviewer outputs, execution metadata, and an output path.

Before reading relations into scoring, it verifies the gold file hash, corpus version, pair count, pair order, relation counts, source SHA, blind/gold identities, prompt and response-schema hashes, exact CLI versions, requested models, effective model sets, raw-artifact hashes and envelopes, absence of tool events/use, successful exits, four unique reviewer-condition invocations, and identical effective composition across a reviewer's two conditions. Claude model usage is checked against its raw envelope; Codex event evidence checks token usage and closed-world item types, while its effective model identity remains selector-attested because the CLI event stream does not provider-attest it. Any mismatch throws and produces no metrics.

`normalize-results.ts` unwraps Codex's final JSON and Claude Code's `structured_output` or JSON `result` without semantic transformation. The evaluator then enforces exact item and pair order, complete coverage, confidence bounds, nonempty rationales, and Condition B affected-abstraction coverage.

The evaluator performs formatting-only root-label normalization. It has no semantic aliases, ontology mapping, prompt tuning, gold repair, missing-value imputation, or post-result exclusions. Condition B abstentions remain explicit. Confidence summaries and Wilson intervals are descriptive and do not participate in the gate.

The evaluator does not invoke a model, access a provider API, mutate the corpus, publish results, or change Prime core. Synthetic unit tests exercise scoring, normalization, interval calculation, and model-composition rejection without producing classifications for the real corpus.
