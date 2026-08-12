# Proposed subsequent classification runs

No classification run, prompt, metric threshold, or model invocation is authorized or frozen by Run 3.

## Required preregistration

On a new branch from the final Run 3 SHA, prepare classification prompts that reference the frozen Run 3 corpus without embedding obsolete Run 2 item IDs. Freeze those prompt bytes, response schemas, evaluator, exact-count decision criteria, uncertainty reporting, and commands before execution. The Run 2 percentage thresholds are not inherited: with 3 positive and 13 negative gold pairs, one error changes missed-checkpoint rate by 33.3 points or false-checkpoint rate by 7.7 points.

The same newly frozen prompts and evaluator must be byte-identical in both arms below. This preregistration is a separate deliverable and requires explicit authorization; it must not execute a model.

## Run A — clean replication control

After preregistration approval, create a fresh execution branch and use:

- Codex: `gpt-5.6-sol`
- Claude: `claude-opus-4-6`

This preserves the prior model configuration while changing the corpus. Freeze and report Run A before authorizing a model-change arm.

## Run B — Opus 5 model-change arm

Only after Run A is frozen, create another fresh branch from the same preregistration SHA. Reuse the identical corpus, prompts, schemas, evaluator, criteria, and Codex configuration. Change only the Claude selector to `claude-opus-5`.

Run B requires separate explicit authorization. Do not pool, tune, or expose Run A outputs to Run B reviewers.
