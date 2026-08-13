# Frozen execution plan — not authorized

These commands are templates only. Do not run them on this preregistration branch. Future execution requires explicit authorization naming the independently reviewed preregistration commit. It does not authorize Run B, corpus relabeling, scoring, publication, or any rerun.

Both adjudicators must receive only the byte-identical `prompts/adjudication.txt` bytes and the exact response-schema JSON value from this directory. They run once in separate fresh temporary directories with no repository access, tools, network, session persistence, user configuration, or knowledge of the other output. The operator must not inspect either output until both invocations have exited and the raw manifest is frozen.

## Preflight

```bash
REPO="$PWD"
PREREG_SHA=<authorized-40-character-reviewed-sha>
EXP="$REPO/packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5"
RESULTS="$EXP/results"
npx tsx "$EXP/execution-preflight.ts" "$PREREG_SHA" "$REPO" "$EXP" "$RESULTS/raw"
```

The preflight rejects a preexisting results directory, a dirty worktree, a HEAD other than the authorized SHA, changed prompt/schema bytes, or CLI versions other than `codex-cli 0.146.0` and `Claude Code 2.1.228`.

## Independent Codex adjudicator

```bash
CODEX_TMP=$(mktemp -d)
cp "$EXP/schemas/adjudication-response.schema.json" "$CODEX_TMP/schema.json"
set +e
codex exec --ephemeral --ignore-rules --ignore-user-config --skip-git-repo-check \
  --sandbox read-only --model gpt-5.6-sol -c model_reasoning_effort=medium \
  --output-schema "$CODEX_TMP/schema.json" \
  --output-last-message "$RESULTS/raw/codex-response.json" \
  --json --cd "$CODEX_TMP" - < "$EXP/prompts/adjudication.txt" \
  > "$RESULTS/raw/codex-events.jsonl" \
  2> "$RESULTS/raw/codex-stderr.txt"
CODEX_EXIT=$?
set -e
printf '%s\n' "$CODEX_EXIT" > "$RESULTS/raw/codex-exit.txt"
rm -rf "$CODEX_TMP"
```

## Independent Claude adjudicator

Run independently; do not expose the Codex session, paths, status, or output.

```bash
CLAUDE_TMP=$(mktemp -d)
set +e
(
  cd "$CLAUDE_TMP"
  claude --print --no-session-persistence --disable-slash-commands --no-chrome \
    --safe-mode --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --prompt-suggestions false --permission-mode plan \
    --model claude-opus-5 --effort high --output-format json \
    --json-schema "$(cat "$EXP/schemas/adjudication-response.schema.json")" \
    < "$EXP/prompts/adjudication.txt"
) > "$RESULTS/raw/claude-envelope.json" \
  2> "$RESULTS/raw/claude-stderr.txt"
CLAUDE_EXIT=$?
set -e
printf '%s\n' "$CLAUDE_EXIT" > "$RESULTS/raw/claude-exit.txt"
rm -rf "$CLAUDE_TMP"
```

## Freeze and mechanically normalize

Before opening any output, create the pre-read raw manifest. Extraction reads only the Claude envelope's structured response and rejects invocation errors or permission denials.

```bash
(
  cd "$RESULTS"
  find raw -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 > raw-prefreeze-manifest.sha256
)
npx tsx "$EXP/extract-claude-response.ts" \
  "$RESULTS/raw/claude-envelope.json" "$RESULTS/raw/claude-response.json"
npx tsx "$EXP/build-execution-metadata.ts" \
  "$PREREG_SHA" "$RESULTS/raw-prefreeze-manifest.sha256" \
  "$RESULTS/raw/execution-preflight.json" \
  "$EXP/prompts/adjudication.txt" "$EXP/schemas/adjudication-response.schema.json" \
  "$RESULTS/raw/codex-response.json" "$RESULTS/raw/codex-events.jsonl" "$RESULTS/raw/codex-exit.txt" \
  "$RESULTS/raw/claude-response.json" "$RESULTS/raw/claude-envelope.json" "$RESULTS/raw/claude-exit.txt" \
  ATTEST_OUTPUTS_MUTUALLY_HIDDEN_UNTIL_FROZEN "$RESULTS/execution-metadata.json"
```

If identity, effective model composition, provider, no-tool evidence, exit status, prompt/schema hash, packet hash, coverage, or schema validation fails, stop. No repair, selective retry, fallback adjudicator, or prompt change is allowed under this preregistration.

## Blind finalization, then unblinding

The first command has no original-gold or case-map input and emits only opaque case results. Freeze it before the comparison command crosses the blinding boundary.

```bash
npx tsx "$EXP/adjudicate-blind.ts" \
  "$EXP" "$RESULTS/raw-prefreeze-manifest.sha256" \
  "$RESULTS/raw/codex-response.json" "$RESULTS/raw/codex-events.jsonl" \
  "$RESULTS/raw/claude-response.json" "$RESULTS/raw/claude-envelope.json" \
  "$RESULTS/execution-metadata.json" "$RESULTS/raw/execution-preflight.json" \
  "$RESULTS/blind-final.json"
BLIND_FINAL_SHA=$(shasum -a 256 "$RESULTS/blind-final.json" | cut -d ' ' -f 1)
printf '%s  %s\n' "$BLIND_FINAL_SHA" blind-final.json > "$RESULTS/blind-final-manifest.sha256"
npx tsx "$EXP/compare-with-gold.ts" \
  "$EXP" "$EXP/../review-finding-corpus-validation-run3/frozen/gold-pairs.json" \
  "$RESULTS/blind-final.json" "$BLIND_FINAL_SHA" "$RESULTS/gold-comparison.json"
```

Freeze all raw, metadata, blind-final, comparison, and manifest artifacts before any interpretation. Any descriptive impact report requires separate result-generation authorization. Run B remains unauthorized.
