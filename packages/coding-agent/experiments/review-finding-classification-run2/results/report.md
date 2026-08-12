# Run 2 report — review-finding root classification

## Decision

**CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED**

The frozen evaluator selects this conclusion because the operational thresholds did not all pass. However, exact-SHA peer review activated the stop condition for prompt leakage and label imitation: the corpus is not a valid blind test, so Run 2 does not provide clean evidence for or against autonomous classification. `CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED` means the hypothesis is unsupported by this run, not disproven. Classification difficulty did not reveal a missing core capability, so `CORE_HOOK_EVIDENCE_REQUIRED` is not justified.

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

## Exact-SHA peer review and stop condition

Three independent exact-SHA review rounds found progressively broader corpus leakage. Examples include retained recommendations, prior severity/disposition language, and literal root-class labels. They also found non-atomic excerpts that duplicate manifestations represented by other corpus items. The committed inventories from earlier review rounds were demonstrably incomplete; no post-hoc exclusion set is presented as complete or as valid sensitivity evidence.

This contradicts the frozen redaction claim and creates prompt leakage, label imitation, and correlated/non-atomic inputs. The frozen corpus and raw outputs remain unchanged as evidence; they were not repaired after results became visible.

Therefore the experiment stop condition is active: Run 2 measured leakage or label imitation in a material and unbounded part of the corpus rather than isolating root-cause recognition. Full-corpus metrics remain mechanically reproducible but are not clean hypothesis evidence. Earlier post-hoc subset calculations are withdrawn because the contamination boundary could not be closed without redesigning the corpus after outputs were visible. No further classifier execution or protocol tuning is justified in this run.

## Run 1 disposition and next experiment

Keep Run 1 frozen as experimental evidence. Do not simplify or promote it yet, and do not add a core `ReviewFinding` entity. Abandon Run 2 as a decisive classification test while preserving it as failed-method evidence. The smallest justified next experiment is corpus-validation only: a fresh, independently audited set of atomic findings with machine checks and human review proving that labels, severity, dispositions, recommendations, and duplicated manifestations are absent before any model runs. Only after that gate should the same pairwise experiment be rerun.
