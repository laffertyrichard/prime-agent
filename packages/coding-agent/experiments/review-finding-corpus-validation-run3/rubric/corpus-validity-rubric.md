# Corpus atomicity and leakage rubric

Version: `corpus-validity-rubric-v1`

This rubric is frozen before independent corpus audit. Auditors receive only this rubric and the complete blind corpus. They do not receive provenance, source ordering, gold pairs, prior reviewer text, or another auditor's output.

## Item-level gates

An item passes only if all three gates pass.

### Atomicity

`PASS` means the item describes exactly one externally distinguishable manifestation. Minimal context needed to state the manifestation is allowed. A causal chain, multiple independent outcomes, a list of defects, or one excerpt that also restates another corpus manifestation is `FAIL`.

Two different manifestations may plausibly share an architectural cause; that does not make either item non-atomic.

### Leakage

`PASS` means the text neither states nor strongly implies any of the following:

- a root-cause label, ontology term, or prior grouping assignment;
- severity, priority, blocking status, disposition, acceptance, or rejection;
- a recommendation, fix, remediation, workaround, or preferred architecture;
- reviewer, model, provider, prompt, run, source file, source line, commit SHA, or provenance identity;
- checkpoint terminology or a prior escalation decision;
- a gold relationship, expected pair decision, or corpus ordering signal.

Neutral domain nouns required to state observed behavior are allowed only when they do not disclose a prior classification. Evaluative language such as “overbuilt,” “wrong,” or “dead code” is leakage; a literal observed state or field name is not automatically leakage.

### Duplicate manifestation

`PASS` means no other item describes the same observable outcome, including a paraphrase, subset, superset, or repeated source evidence. Items that share a possible cause but have independently observable outcomes are not duplicates.

If duplication is suspected, list every counterpart item ID. An item cannot pass this gate while listing a counterpart.

## Corpus-level gates

The corpus passes only when:

1. every auditor returns one decision for every item;
2. every item receives `PASS` from both auditors on atomicity, leakage, and duplicate manifestation;
3. every auditor disagreement is adjudicated with a recorded rationale;
4. any failed or disputed item is rewritten and independently re-audited, or excluded;
5. mechanical validation passes, including seeded leakage, atomicity, and duplicate canaries;
6. blind IDs and order are opaque and do not encode provenance or gold relationships;
7. provenance and blind files have identical item-ID sets but remain separate;
8. gold pairs contain only `SAME_ROOT` or `DIFFERENT_ROOT`; ambiguous cases are resolved or excluded before freeze;
9. all frozen artifacts and source excerpts are hash-pinned;
10. no classification invocation or classification output exists in this run.

## Auditor response rule

Auditors assess corpus validity only. They must not assign root classes, infer gold pair labels, or recommend classification labels. A proposed wording change is allowed only to explain a failed leakage or atomicity gate; it is not a classification result.
