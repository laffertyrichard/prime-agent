# Frozen execution plan — not authorized

This document freezes future commands only. Do not run them from the preregistration branch. Execution requires explicit authorization naming the reviewed preregistration SHA and the arm. Each execution arm starts from that exact SHA on a fresh branch. Run B remains unauthorized until Run A is frozen.

## Preflight

Require a clean execution worktree at the authorized preregistration SHA. Verify the Run 3 and preregistration manifests, exact CLI versions (`codex-cli 0.146.0`, `Claude Code 2.1.228`), prompt/schema hashes, and absence of a preexisting `results` directory. Set:

```bash
PREREG_SHA=<authorized-40-character-sha>
ARM=RUN_A_CONTROL # or RUN_B_OPUS5 only when separately authorized
EXP="$PWD/packages/coding-agent/experiments/review-finding-classification-preregistration-run4"
RESULTS="$EXP/results"
mkdir -p "$RESULTS/raw"
```

For `RUN_A_CONTROL`, set `CLAUDE_MODEL=claude-opus-4-6`. For `RUN_B_OPUS5`, set `CLAUDE_MODEL=claude-opus-5`. Never reuse a session or raw directory across invocations or arms.

## Codex invocation template

Run once with `CONDITION=A` and once with `CONDITION=B`. Do not inspect either output until all four invocations have ended and raw files have been hashed.

```bash
CONDITION=A
LOWER=$(printf '%s' "$CONDITION" | tr '[:upper:]' '[:lower:]')
TMP=$(mktemp -d)
cp "$EXP/schemas/condition-$LOWER-response.schema.json" "$TMP/schema.json"
set +e
codex exec --ephemeral --ignore-rules --ignore-user-config --skip-git-repo-check \
  --sandbox read-only --model gpt-5.6-sol -c model_reasoning_effort=medium \
  --output-schema "$TMP/schema.json" \
  --output-last-message "$RESULTS/raw/condition-$LOWER-codex-final.json" \
  --json --cd "$TMP" - < "$EXP/prompts/condition-$LOWER.txt" \
  > "$RESULTS/raw/condition-$LOWER-codex-events.jsonl" \
  2> "$RESULTS/raw/condition-$LOWER-codex-stderr.txt"
CODE=$?
set -e
printf '%s\n' "$CODE" > "$RESULTS/raw/condition-$LOWER-codex-exit.txt"
rm -rf "$TMP"
```

## Claude invocation template

Run once with `CONDITION=A` and once with `CONDITION=B`, with the arm-specific selector above.

```bash
CONDITION=A
LOWER=$(printf '%s' "$CONDITION" | tr '[:upper:]' '[:lower:]')
TMP=$(mktemp -d)
set +e
(
  cd "$TMP"
  claude --print --no-session-persistence --disable-slash-commands --no-chrome \
    --prompt-suggestions false --permission-mode plan \
    --disallowedTools 'Bash,Read,Glob,Grep,WebFetch,WebSearch,Edit,Write,NotebookEdit' \
    --model "$CLAUDE_MODEL" --effort high --output-format json \
    --json-schema "$(cat "$EXP/schemas/condition-$LOWER-response.schema.json")" \
    < "$EXP/prompts/condition-$LOWER.txt"
) > "$RESULTS/raw/condition-$LOWER-claude.json" \
  2> "$RESULTS/raw/condition-$LOWER-claude-stderr.txt"
CODE=$?
set -e
printf '%s\n' "$CODE" > "$RESULTS/raw/condition-$LOWER-claude-exit.txt"
rm -rf "$TMP"
```

## Freeze, normalize, and evaluate

Before opening raw outputs, hash every file under `results/raw`, then build metadata directly from those artifacts. The operator's `outputsMutuallyHiddenUntilFrozen: true` assertion is admissible only if no reviewer output was viewed before all four hashes existed.

```bash
npx tsx "$EXP/build-execution-metadata.ts" \
  "$ARM" "$PREREG_SHA" "$RESULTS" \
  ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN \
  "$RESULTS/execution-metadata.json"
npx tsx "$EXP/normalize-results.ts" "$ARM" \
  "$RESULTS/raw/condition-a-codex-final.json" \
  "$RESULTS/raw/condition-a-claude.json" \
  "$RESULTS/raw/condition-b-codex-final.json" \
  "$RESULTS/raw/condition-b-claude.json" \
  "$RESULTS/normalized-results.json"
npx tsx "$EXP/evaluate.ts" \
  "$EXP/../review-finding-corpus-validation-run3/frozen/gold-pairs.json" \
  "$RESULTS/normalized-results.json" \
  "$RESULTS/execution-metadata.json" \
  "$RESULTS/metrics.json"
```

The evaluator must stop without metrics on any identity, evidence, composition, coverage, or integrity mismatch. Preserve raw outputs, stderr, exit codes, metadata, normalized outputs, metrics, and a complete SHA-256 manifest before any cross-arm comparison. Do not tune or rerun a failed classification under this preregistration; stop and seek authorization for a replacement protocol.
