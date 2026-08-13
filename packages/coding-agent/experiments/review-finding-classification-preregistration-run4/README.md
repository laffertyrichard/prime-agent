# Review-finding classification preregistration — Run 4

This fork-only experiment directory is a no-execution preregistration derived from the validated Run 3 corpus. It changes no Prime core behavior.

## Pinned source

- Source/branch point: `bd247656aeeabea6b347bc892c0bfb9236fd7663`
- Corpus version: `frozen-1`
- Blind corpus SHA-256: `b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b`
- Provenance corpus SHA-256: `06e4e64e98730e1c487078761d947a31ce7754edbf8f23150cd73f68c32ead19`
- Gold-pair SHA-256: `5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b`
- Instrument: 22 blind atomic manifestations and 16 binary gold pairs (3 same-root, 13 different-root)

The source artifacts remain under `../review-finding-corpus-validation-run3/frozen/`; this directory does not copy or mutate them.

## Frozen preregistration surface

- `prompts/`: byte-complete Condition A and Condition B prompts with the pinned blind corpus; no Run 2 finding IDs or results.
- `schemas/`: provider response contracts plus normalized-result and execution-evidence contracts.
- `evaluator-design.md`, `scoring-rules.md`, and `uncertainty-reporting.md`: deterministic evaluator and reporting policy.
- `model-composition.json`: exact tool/model constraints and fail-closed auxiliary-model policy.
- `execution-plan.md`: future command templates, frozen but not authorized.
- `normalize-results.ts`, `build-execution-metadata.ts`, and `evaluate.ts`: formatting-only normalization, raw-evidence metadata construction, and scoring.
- `protocol.json` and `preregistration-manifest.sha256`: identities, boundaries, and hashes.

## Boundary

No model or provider API was invoked for this preregistration. No classification, labeling, result generation, prompt tuning against outcomes, merge, push, PR, or publication is authorized. There is intentionally no `results/` directory.

Stop at this artifact for review. A later execution authorization must name the reviewed preregistration SHA and authorize one arm. Run A (`gpt-5.6-sol` plus `claude-opus-4-6`) must be executed and frozen before Run B (`gpt-5.6-sol` plus requested `claude-opus-5`) can be separately authorized.

## Local verification

These commands do not invoke a model or provider API:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run \
  experiments/review-finding-classification-preregistration-run4/evaluate.test.ts \
  experiments/review-finding-classification-preregistration-run4/validate-preregistration.test.ts
npx tsx experiments/review-finding-classification-preregistration-run4/validate-preregistration.ts \
  experiments/review-finding-classification-preregistration-run4 \
  ../..
cd ../..
npx tsc -p packages/coding-agent/experiments/review-finding-classification-preregistration-run4/tsconfig.json --noEmit
(
  cd packages/coding-agent/experiments/review-finding-classification-preregistration-run4
  shasum -a 256 -c preregistration-manifest.sha256
)
npm run check
git diff --check
```
