# Blind gold-pair re-adjudication preregistration — Run 5

This fork-only directory preregisters a separate, no-execution, blind re-adjudication of every one of the 16 frozen Run 3 gold pairs. It branches from immutable Run A evidence SHA `f1450e95a197b91998550566e36484f046a2a8ed` and changes no Prime core behavior.

## Protected evidence

Run A and the original gold corpus remain byte-for-byte unchanged in their existing directories. This preregistration creates only a derived blind packet and a sealed identity crosswalk. It does not edit, copy as replacement, relabel, or regenerate the original corpus or Run A result.

- Run A evidence SHA: `f1450e95a197b91998550566e36484f046a2a8ed`
- Frozen blind corpus SHA-256: `b7b3f5cab0bc588d0a33f560275ff599fcef484287f07c078bc4b763b8043e9b`
- Frozen original gold SHA-256: `5842ff5334d326252c0d9f7d4f0906ad5f1086333415c60ddf481fc18262695b`
- Run A evidence-manifest SHA-256: `a3e2dde507f52902d118f25c20838b1e3ff4c0bc172afe21c98a7060b7b0bfdd`
- Coverage: all 16 original gold pairs exactly once

## Blinding boundary

Adjudicators receive only the byte-identical `prompts/adjudication.txt` bytes and the exact JSON value from `schemas/adjudication-response.schema.json` in isolated empty environments. The prompt embeds `blind-packet.json`, whose random 128-bit case aliases, order, and orientations were derived using a sealed random HMAC salt without relations, rationales, or outcomes as inputs.

Adjudicators do not receive the repository, `sealed/case-map.json`, original item or pair IDs, original relations or rationales, provenance, Run A raw or normalized outputs, metrics or conclusion, prior reviewer or audit decisions, source hashes, or another adjudicator's response. Because these data exist in repository history, credible blindness requires operational isolation; the packet is not claimed blind to anyone allowed to inspect this checkout or its history.

## Frozen procedure

- `adjudicators.json` freezes two independent provider/model identities and fail-closed composition rules.
- `adjudication-rules.md` freezes the one-coherent-remediation criterion, causal-proximity distinction, abstention/confidence rules, and unanimous binary finalization.
- `prompts/` and `schemas/` freeze the complete adjudicator instrument and response/result contracts.
- `execution-plan.md` freezes future commands without authorizing them.
- `execution-preflight.ts`, `extract-claude-response.ts`, `build-execution-metadata.ts`, `adjudicate-blind.ts`, and `compare-with-gold.ts` freeze evidence capture, normalization, blind finalization, and post-freeze comparison.
- `interpretation-policy.md` freezes how confirmed changes or unresolved cases qualify interpretation without rewriting or re-gating Run A.
- `protocol.json` and the SHA-256 manifests pin the complete preregistration and adjudicator allowlist.

The blind finalizer cannot read original gold or the sealed crosswalk. Only after its opaque output is hash-frozen may the separate comparator join to the immutable original gold.

## Boundary

No human or model adjudication, model/provider API invocation, corpus relabeling, Run B execution, result generation, prompt tuning, push, merge, PR, or publication is authorized. There is intentionally no `results/` directory. Any future execution must name the independently reviewed exact preregistration SHA. A failed or malformed invocation cannot be repaired or rerun under this protocol.

## Local verification

These commands perform only static, synthetic, and mechanical validation; they invoke no model or provider API:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run \
  experiments/review-finding-gold-readjudication-preregistration-run5/adjudication-lib.test.ts \
  experiments/review-finding-gold-readjudication-preregistration-run5/validate-preregistration.test.ts
npx tsx experiments/review-finding-gold-readjudication-preregistration-run5/validate-preregistration.ts \
  experiments/review-finding-gold-readjudication-preregistration-run5 ../..
cd ../..
npx tsc -p packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/tsconfig.json --noEmit
(
  cd packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5
  shasum -a 256 -c preregistration-manifest.sha256
  shasum -a 256 -c adjudicator-packet-manifest.sha256
)
npm run check
git diff --check
```

Stop with the committed exact SHA and a clean worktree for independent review.
