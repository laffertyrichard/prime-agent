# Frozen corpus reproduction protocol

## Integrity

```bash
cd packages/coding-agent/experiments/review-finding-corpus-validation-run3
shasum -a 256 -c preaudit-manifest.sha256
shasum -a 256 -c candidate-manifest.sha256
shasum -a 256 -c frozen-manifest.sha256
```

## Mechanical and source validation

The authorized local source root must contain the hash-pinned `run-1`, `run-2`, and `run-3` review artifacts named by `frozen/provenance-corpus.json`.

```bash
cd packages/coding-agent
SOURCE_ROOT=/Users/mccully/.prime/agent/session-artifacts/019ff798-aacf-7465-915d-1070050a8831/reviews
npx tsx ../../node_modules/vitest/dist/cli.js --run \
  experiments/review-finding-corpus-validation-run3/validate-corpus.test.ts \
  experiments/review-finding-corpus-validation-run3/candidate/validate-candidate.test.ts \
  experiments/review-finding-corpus-validation-run3/frozen/validate-frozen.test.ts
npx tsx experiments/review-finding-corpus-validation-run3/frozen/validate-frozen.ts \
  experiments/review-finding-corpus-validation-run3/frozen/blind-corpus.json \
  experiments/review-finding-corpus-validation-run3/frozen/provenance-corpus.json \
  experiments/review-finding-corpus-validation-run3/frozen/gold-pairs.json \
  /tmp/run3-mechanical-validation.json \
  "$SOURCE_ROOT"
cmp /tmp/run3-mechanical-validation.json \
  experiments/review-finding-corpus-validation-run3/frozen/mechanical-validation.json
```

## Independent audit replay

Round 1 is reproduced with `prompts/audit-blind-corpus.txt`; Round 2 uses `prompts/audit-blind-corpus-round-2.txt`. Use the exact commands in the root `README.md`, substituting the Round 2 prompt and adding `--prompt-suggestions false` for the Claude Round 2 command. Each reviewer must run in a new empty temporary directory with only the prompt and `schemas/audit-response.schema.json`. Do not supply provenance, gold pairs, adjudications, repository access, or the other reviewer output.

Round 2 audited 24 items. The final 22-item corpus is the strict subset remaining after both sides of the only disputed duplicate pair were excluded. Every retained item has `PASS` from both auditors for atomicity, leakage, and duplicate manifestation.

## Prohibited action

Do not append classification commands to this protocol. Classification requires a separate branch and explicit authorization naming this frozen instrument SHA.
