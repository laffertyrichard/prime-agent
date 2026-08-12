# Review-finding corpus validation — Run 3

This run validates and freezes a blind corpus. It does not execute classification.

## Preserved boundaries

- Run 1 remains at `8cc25603ae5115713dc69d7ebdb913994ce291d5`.
- Run 2 remains at `57283d1b01378f12bbb05e19653cdfa89a1aa796` on `experiment/review-finding-classification-run2`.
- PR #2 is not modified.
- This branch starts from the exact Run 2 SHA and changes only this experiment directory.

## Gate sequence

1. Construct separate blind and provenance corpora from hash-pinned authorized local review artifacts.
2. Freeze the atomicity/leakage/duplicate rubric, gold pairs, mechanical validator, canaries, response schema, and audit prompt.
3. Run independent corpus-validity audits. These are not classification tasks; auditors are prohibited from assigning root classes or pair labels.
4. Adjudicate every failure or disagreement. Rewrite and re-audit or exclude every disputed item.
5. Admit only binary gold pairs. Exclude unresolved relationships.
6. Freeze final artifacts and manifests only if every retained item passes every gate.
7. Stop without any classification invocation.

## Mechanical validation

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run experiments/review-finding-corpus-validation-run3/validate-corpus.test.ts
npx tsx experiments/review-finding-corpus-validation-run3/validate-corpus.ts \
  experiments/review-finding-corpus-validation-run3/draft/blind-corpus.json \
  experiments/review-finding-corpus-validation-run3/draft/provenance-corpus.json \
  experiments/review-finding-corpus-validation-run3/draft/gold-pairs.json \
  experiments/review-finding-corpus-validation-run3/draft/mechanical-validation.json
```

## Independent audit commands

Run both commands concurrently from the repository root. Each receives only the same frozen prompt/schema in a fresh temporary directory. Do not copy the provenance or gold files into either directory.

```bash
EXP="$PWD/packages/coding-agent/experiments/review-finding-corpus-validation-run3"
TMP=$(mktemp -d)
cp "$EXP/schemas/audit-response.schema.json" "$TMP/schema.json"
codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check \
  --sandbox read-only --model gpt-5.6-sol --output-schema "$TMP/schema.json" \
  --output-last-message "$EXP/audits/round-1/codex-final.json" --json --cd "$TMP" - \
  < "$EXP/prompts/audit-blind-corpus.txt" \
  > "$EXP/audits/round-1/codex-events.jsonl" \
  2> "$EXP/audits/round-1/codex-stderr.txt"
rm -rf "$TMP"
```

```bash
EXP="$PWD/packages/coding-agent/experiments/review-finding-corpus-validation-run3"
TMP=$(mktemp -d)
(
  cd "$TMP"
  claude --print --no-session-persistence --disable-slash-commands --no-chrome \
    --permission-mode plan --tools '' --model claude-opus-5 --effort high \
    --system-prompt 'Audit only the supplied corpus. Do not classify.' \
    --output-format json --json-schema "$(cat "$EXP/schemas/audit-response.schema.json")" \
    < "$EXP/prompts/audit-blind-corpus.txt"
) > "$EXP/audits/round-1/claude.json" \
  2> "$EXP/audits/round-1/claude-stderr.txt"
rm -rf "$TMP"
```

## Classification boundary

No classification command belongs in this run. A later run requires explicit authorization after this gate passes. Its first arm must preserve the prior `gpt-5.6-sol` / `claude-opus-4-6` configuration as a clean-replication control. A separate later arm may use `claude-opus-5` on the same frozen instrument so corpus and model changes are not confounded.
