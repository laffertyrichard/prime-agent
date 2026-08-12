# Review-finding recurrence classification experiment — Run 2

This directory is fork-only experimental evidence. It does not change Prime core or the Run 1 projector.

## Frozen inputs

- Base/Run 1 SHA: `8cc25603ae5115713dc69d7ebdb913994ce291d5`
- Corpus: 25 genuine findings, `blind-corpus.json` SHA-256 `d641e6ade46bc677c3167783867fb70f61c3535e707457263fd83e9d5e0f2592`
- Gold pairs: 6 `SAME_ROOT`, 18 `DIFFERENT_ROOT`, 4 `AMBIGUOUS`
- Protocol, thresholds, model selectors, normalization, metrics, and decision rules: `protocol.json`
- Exact reviewer prompts: `prompts/condition-a.txt`, `prompts/condition-b.txt`

The corpus copies verbatim excerpts from authorized Run 1 Codex and Claude review artifacts. Blind inputs remove solution text, prior root-class labels, dispositions, and one absolute local path prefix. Provenance and source hashes are in `corpus.json` and `protocol.json`.

## Independence

Run each command in a fresh temporary directory. Do not place `gold-pairs.json`, repository files, or another reviewer output in that directory. Freeze all four raw outputs before normalization or evaluation.

## Exact reviewer commands

From the repository root, create `results/raw`, then run each block independently. The `results` directory is intentionally absent from the preregistration commit.

```bash
set -euo pipefail
EXP="$PWD/packages/coding-agent/experiments/review-finding-classification-run2"
mkdir -p "$EXP/results/raw"
TMP=$(mktemp -d)
cp "$EXP/schemas/condition-a.schema.json" "$TMP/schema.json"
codex exec --ephemeral --ignore-rules --ignore-user-config --skip-git-repo-check \
  --sandbox read-only --model gpt-5.6-sol --output-schema "$TMP/schema.json" \
  --output-last-message "$EXP/results/raw/condition-a-codex-final.json" \
  --json --cd "$TMP" - < "$EXP/prompts/condition-a.txt" \
  > "$EXP/results/raw/condition-a-codex-events.jsonl" \
  2> "$EXP/results/raw/condition-a-codex-stderr.txt"
printf '%s\n' "$?" > "$EXP/results/raw/condition-a-codex-exit.txt"
rm -rf "$TMP"
```

```bash
set -euo pipefail
EXP="$PWD/packages/coding-agent/experiments/review-finding-classification-run2"
mkdir -p "$EXP/results/raw"
TMP=$(mktemp -d)
(
  cd "$TMP"
  claude --print --no-session-persistence --disable-slash-commands --no-chrome \
    --permission-mode plan --disallowedTools 'Bash,Read,Glob,Grep,WebFetch,WebSearch,Edit,Write,NotebookEdit' \
    --model claude-opus-4-6 --effort high --output-format json \
    --json-schema "$(cat "$EXP/schemas/condition-a.schema.json")" \
    < "$EXP/prompts/condition-a.txt"
) > "$EXP/results/raw/condition-a-claude.json" \
  2> "$EXP/results/raw/condition-a-claude-stderr.txt"
printf '%s\n' "$?" > "$EXP/results/raw/condition-a-claude-exit.txt"
rm -rf "$TMP"
```

Repeat the two blocks with `condition-a` replaced by `condition-b` and the corresponding prompt/schema. No output from Condition A is included in Condition B.

## Normalize and evaluate

```bash
EXP=packages/coding-agent/experiments/review-finding-classification-run2
npx tsx "$EXP/normalize-results.ts" \
  "$EXP/results/raw/condition-a-codex-final.json" \
  "$EXP/results/raw/condition-a-claude.json" \
  "$EXP/results/raw/condition-b-codex-final.json" \
  "$EXP/results/raw/condition-b-claude.json" \
  "$EXP/results/classifications.json"
npx tsx --tsconfig "$EXP/tsconfig.json" "$EXP/evaluate.ts" \
  "$EXP/gold-pairs.json" \
  "$EXP/results/classifications.json" \
  "$EXP/results/metrics.json"
```

`evaluate.ts` imports and calls the Run 1 `recordFinding`, `recordRemediation`, and `assessReviewState` functions. The local path aliases stub only `StringEnum` and `truncateHead` so the source module can load without a build; they do not reimplement or alter projector semantics.

## Verification

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run experiments/review-finding-classification-run2/evaluate.test.ts
cd ../..
npm run check
git diff --check
```
