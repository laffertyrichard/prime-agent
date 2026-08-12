# Run 2 report — review-finding root classification

## Decision

**CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED**

The minimal rubric improved conceptual grouping, but the frozen operational thresholds did not all pass. Codex produced a false checkpoint rate of 11.1% under explicit Condition B pair decisions; Claude missed 16.7% of gold same-root checkpoints. Classification difficulty did not reveal a missing core capability, so `CORE_HOOK_EVIDENCE_REQUIRED` is not justified.

## Scope and frozen protocol

- Branch: `experiment/review-finding-classification-run2`
- Base and unchanged Run 1 projector SHA: `8cc25603ae5115713dc69d7ebdb913994ce291d5`
- Corpus: 25 genuine findings from authorized local Run 1 Codex/Claude artifacts.
- Blind corpus SHA-256: `d641e6ade46bc677c3167783867fb70f61c3535e707457263fd83e9d5e0f2592`
- Gold pairs: 6 `SAME_ROOT`, 18 `DIFFERENT_ROOT`, 4 `AMBIGUOUS`.
- Thresholds: per-reviewer F1 >= 0.80; inter-reviewer agreement >= 0.80; false checkpoint <= 5%; missed checkpoint <= 10%. Exact-label agreement is diagnostic; Condition A additionally required >= 0.80 to support conclusion A.
- Response-schema compatibility was corrected before successful inference. The correction preserved fields and semantics; failed no-output invocations are retained under `results/failed-attempt-0`.

## Reviewer versions

- Codex: `codex-cli 0.146.0`, OpenAI `gpt-5.6-sol`, medium reasoning.
- Claude: Claude Code `2.1.228`, Anthropic `claude-opus-4-6`, high effort.
- Each reviewer-condition ran in a fresh temporary directory with non-persistent sessions. Reviewers received only one frozen prompt/schema and no gold or other-reviewer output.

## Results

| Condition | Reviewer | Exact cross-reviewer item labels | Pair F1 | False checkpoints | Missed checkpoints | Ambiguous rate |
|---|---|---:|---:|---:|---:|---:|
| A: open labels | Codex | 16.0% | 0.500 | 0.0% | 66.7% | n/a |
| A: open labels | Claude | 16.0% | 0.667 | 0.0% | 50.0% | n/a |
| B: rubric, explicit pairs | Codex | 4.0% | 0.857 | 11.1% | 0.0% | 0.0% |
| B: rubric, explicit pairs | Claude | 4.0% | 0.909 | 0.0% | 16.7% | 0.0% |

Condition A label-derived inter-reviewer pair agreement was 95.8%, but both reviewers mostly agreed on `DIFFERENT_ROOT`; exact labels and same-root recall failed. Condition B explicit inter-reviewer pair agreement was 87.5%. Its raw labels were more internally coherent than cross-reviewer labels: Codex raw-label replay had F1 1.000 and Claude 0.909, while exact cross-reviewer labels fell to 4.0%. This is evidence that pairwise conceptual decisions are more stable than naming, but not stable enough for the frozen checkpoint thresholds.

## False and missed checkpoint examples

- Codex false checkpoint `P19`: F10 quadratic full-log cloning versus F21 choosing event-log persistence. Codex labeled them differently but explicitly judged `SAME_ROOT`; gold treats algorithmic copying and persistence-model choice as different roots.
- Codex false checkpoint `P23`: F17 insertion-order recurrence versus F23 inconsistent SHA-reuse validation scope. Both involve event history, but one is ordering semantics and the other validity scope.
- Claude missed checkpoint `P06`: F04 runtime wiring forces a whole-package mock versus F25 the same mock hides future runtime import failures. Claude treated module boundary and mock breadth as different roots; gold adjudicated one missing honest test/runtime seam.
- Open-label misses include P01 (`UNNECESSARY_DEPENDENCY` vs `UNREACHABLE_INFRASTRUCTURE`) and P03 (`UNNECESSARY_PUBLIC_API` vs `TEST_DRIVEN_API_LEAKAGE`) for Codex, despite same-root gold.

## Accepted, rejected, unresolved

Against the 24 non-ambiguous gold pairs in Condition B:

- Codex accepted 22 and rejected 2 (`P19`, `P23`).
- Claude accepted 23 and rejected 1 (`P06`).
- Four pairs remain unresolved by design (`P25`–`P28`). Neither reviewer used `AMBIGUOUS`: Codex forced three of four to `SAME_ROOT`; Claude forced all four to `DIFFERENT_ROOT`. The measured reviewer ambiguous-case rate was therefore 0%, while gold ambiguity remained 14.3% of designated pairs.

Errors were mostly substantive pair-boundary disagreements, not formatting differences. Even under the rubric, exact cross-reviewer root-class naming agreed on only F21. The frozen naming-disagreement diagnostic found no case where a reviewer explicitly said `SAME_ROOT` but assigned unequal labels, showing strong within-reviewer coordination; it does not establish a shared cross-reviewer ontology.

## Recurrence replay

`evaluate.ts` imported the Run 1 `recordFinding`, `recordRemediation`, and `assessReviewState` functions unchanged. For each pair it replayed occurrence, remediation, candidate recurrence, remediation, and a third manifestation. Raw-label and explicit-decision-gated replay metrics matched the corresponding equality/pair predictions. Passing replay proves deterministic projection of supplied identity only; it does not validate classification.

## Exact-SHA peer review and contamination sensitivity

Independent reviews inspected `8cc25603ae5115713dc69d7ebdb913994ce291d5..71e9abc4619442e7cacdcdad3364e9cad487d95a`:

- Codex correctness review (`codex-cli 0.146.0`, `gpt-5.6-sol`) found P1 `BLIND_CORPUS_REDACTION_FAILURE`.
- Claude architecture review (Claude Code `2.1.228`, `claude-opus-4-6`) independently found P1 `INCOMPLETE_BLIND_INPUT_REDACTION` and still selected `CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED`.

F19 retained an inline P2 disposition, and F20–F22 retained prior root-class labels; F21 also retained solution text. This contradicts the blind-redaction claim and contaminates 4/25 findings. It likely biases agreement upward: 9/12 reviewer-condition assignments for F20–F22 copied the exposed labels exactly. These inputs and raw outputs remain unchanged as evidence; the defect is not silently repaired after results were visible.

A review-time sensitivity analysis excluding all pairs touching F19–F22 still fails the frozen thresholds: Codex Condition B false checkpoint rate is 1/15 = 6.7%, Claude missed checkpoint rate is 1/4 = 25%, Condition A exact-label agreement is 2/21 = 9.5%, and Condition B exact-label agreement is 0/21. The negative conclusion is therefore conservative and survives complete excision, but Run 2 cannot be described as a fully blind experiment.

## Run 1 disposition and next experiment

Keep Run 1 frozen as experimental evidence. Do not simplify or promote it yet, and do not add a core `ReviewFinding` entity. The smallest justified next experiment is a blinded human-gate study on a fresh corpus: reviewers make pairwise decisions only, a human approves disputed or low-confidence pairs before assigning a canonical label, and the same frozen false/missed checkpoint thresholds are applied. This tests whether a small approval boundary can make the extension useful without pretending autonomous architectural recognition.
