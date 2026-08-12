# Proposed subsequent classification runs

No run in this proposal is authorized by the corpus-validation gate itself.

## Run A — clean replication control

Create a new branch from the frozen corpus-validation SHA. Use the frozen corpus, gold pairs, rubric, and classification prompts without modification. Preserve the prior model configuration:

- Codex: `gpt-5.6-sol`
- Claude: `claude-opus-4-6`

Freeze and report Run A before any model-change arm. This isolates the corpus change from the model change.

## Run B — Opus 5 model-change arm

Only after Run A is frozen, create another fresh branch from the same frozen corpus-validation SHA. Reuse the identical instrument and Codex configuration. Change only the Claude selector to `claude-opus-5`.

Run B requires separate explicit authorization. Do not pool or tune results across arms.
