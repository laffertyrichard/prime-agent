# Decision: repeated-review-defect classification

## Decision

**NO — STOP THIS CONTRIBUTION DIRECTION.**

Do not add repeated-review-defect classification, recurrence detection, architecture escalation, or operator authority to Prime core on the strength of this experiment. Run 4 produced a negative result under its frozen gate, and Run 5 cannot turn that result into a pass.

## 1. Why the decision follows from the frozen evidence

Run 4 Run A is frozen at evidence commit `f1450e95a197b91998550566e36484f046a2a8ed`, the SHA named by the Run 5 preregistration (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/README.md:3-11`). Its metrics identify the arm as `RUN_A_CONTROL` (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/results/metrics.json:1-5`), record `pass: false` for Condition A (`metrics.json:29-32`) and Condition B (`metrics.json:144-146`), and conclude `CLASSIFICATION_HYPOTHESIS_NOT_SUPPORTED` (`metrics.json:278-281`). That is the sole preregistered result.

Run 5 cannot change that conclusion under its own frozen policy. Section 5 says not to rerun or reinterpret Run A's exact-count gate against a revised relation vector and requires both a new corpus version and a new preregistered experiment for confirmatory scoring with revised operational gold (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/interpretation-policy.md:5-11`). Its outcome branches are exhaustive:

- If all 16 original relations are independently confirmed and none is unresolved, Run A remains unchanged (`interpretation-policy.md:13-15`): **NO**.
- If at least one relation changes, Run A remains a historical failure and only descriptive impacts may be reported; no corrected pass or failure is permitted (`interpretation-policy.md:16`): **NO under this experiment; use a new corpus and preregistered experiment**.
- If any case is unresolved, the gold is not fully revalidated and the case cannot be scored, imputed, or selectively retried (`interpretation-policy.md:17`): **NO under this experiment; use a new corpus and preregistered experiment**.

Therefore no Run 5 outcome can support the detector under Run 4's predeclared criteria. Run 5 can qualify confidence in the reference labels, but it cannot reverse the gate.

## 2. Root cause: statistical power, not labels

The frozen instrument contains only 3 `SAME_ROOT` positives and 13 `DIFFERENT_ROOT` negatives among 16 pairs (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/README.md:5-14`; `packages/coding-agent/experiments/review-finding-classification-preregistration-run4/scoring-rules.md:3-5`). The gate requires `correctSameEachReviewer: 3` (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/results/metrics.json:22-26`), which the scoring rules make an all-or-nothing 3/3 positive gate: one missed positive always fails (`scoring-rules.md:13-15`).

For a two-sided 95% Wilson score interval with `z = 1.959963984540054`, the lower bound is

```text
L(x,n) = (p + z²/(2n) - z·sqrt(p(1-p)/n + z²/(4n²))) / (1 + z²/n), p=x/n.
L(3,3) = 0.4385029682 ≈ 0.44.
```

Thus even flawless 3/3 observed sensitivity has a lower bound below 0.5 and cannot separate this detector from chance on sensitivity. The corpus report had already described the gold as a bounded feasibility instrument unable to estimate percentage tolerances (`packages/coding-agent/experiments/review-finding-corpus-validation-run3/frozen/report.md:22-26`). The decisive defect is insufficient positive-class power coupled to an all-or-nothing gate, not a post hoc choice of which current label to prefer.

Condition B demonstrates the brittleness precisely. Both reviewers scored `correctSame: 2`, `missedSame: 1`, `correctDifferent: 13`, and `correct: 15` of 16, or accuracy `0.9375` (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/results/metrics.json:154-181` and `:216-243`). Both name exactly `pair-888ef856a9` as their only failure (`metrics.json:184-186` and `:246-248`). They nevertheless agreed on all 16 pair relations (`metrics.json:144-152`). One common miss therefore failed the condition even though each reviewer was otherwise correct on 15/16 and their inter-reviewer agreement was 16/16.

## 3. Retained substantive finding

Condition A asked independent reviewers to invent compact root-class names and explicitly supplied no candidate ontology or classification rubric (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/prompts/condition-a.txt:1-7`). The two configured models were `gpt-5.6-sol` and `claude-opus-4-6` (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/results/metrics.json:11-20`). Their exact normalized item-label agreement was **0/22**, against the required **18/22** (`metrics.json:22-26` and `:40-46`; the gate is specified at `packages/coding-agent/experiments/review-finding-classification-preregistration-run4/scoring-rules.md:17-21`). Two independent strong models, given the same Condition A instructions and no ontology, agreed on zero root-class names.

Condition B supplied a minimal, model-neutral rubric and asked for explicit pair relations rather than deriving relations from exact label equality (`packages/coding-agent/experiments/review-finding-classification-preregistration-run4/prompts/condition-b.txt:1-16`). It reached **16/16** inter-reviewer pair-relation agreement (`metrics.json:144-152`).

The retained finding is narrow but useful: **pairwise relation judgment under a rubric is tractable on this corpus; an open root-class taxonomy is not stable across these models.** This is direct evidence against placing a defect taxonomy in Prime core. It does not justify replacing the failed gate with agreement as a new post hoc success criterion.

## 4. Scope verdict: extension or skill, not core

The proposed system combines five concerns:

1. **Observation** captures review evidence and binds it to session and commit context.
2. **Classification** interprets provider outputs.
3. **Recurrence detection** persists and compares observations across reviews or sessions.
4. **Architecture escalation** changes what is surfaced to an operator and potentially to daemon/TUI clients.
5. **Operator authority** decides whether remediation stops or continues.

That subsystem cuts across Prime's governed core surfaces rather than exposing one small missing primitive: provider types, implementations, registration, credentials, and model resolution are coordinated surfaces (`AGENTS.md:135-181`); daemon commands, events, response shapes, capabilities, compatibility maps, session attachment, and interactive startup are protocol-controlled (`AGENTS.md:35-42`); keybindings must be configurable (`AGENTS.md:20`); and user-visible core changes enter package changelogs and the lockstep release process (`AGENTS.md:105-128` and `:188-207`). Making the five-concern policy core would couple experimental taxonomy and authority semantics to providers, sessions, protocol compatibility, TUI behavior, configurable input, and release governance.

Prime already provides the narrower optional surfaces this workflow needs. Extensions can register tools and commands, intercept events, ask for user decisions, render custom UI, and persist session state (`packages/coding-agent/docs/extensions.md:3-16`). Skills are on-demand capability packages for specialized workflows, helper scripts, and reference material (`packages/coding-agent/docs/skills.md:3-7`) and can be project-scoped (`packages/coding-agent/docs/skills.md:23-38`). Observation + classification + recurrence detection + architecture escalation + operator authority therefore belongs in an extension, a skill, or a composition of both—not in Prime core.

## 5. Run 5 disposition

Run 5 remains preregistered and unexecuted: its boundary says no adjudication or result generation is authorized and that no `results/` directory exists (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/README.md:33-35`). Run B was also never executed; Run 5 explicitly cannot authorize it (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/interpretation-policy.md:19`).

Run 5 additionally cannot execute as frozen in this environment. Its fail-closed preflight reads the installed CLI versions and requires the exact Claude Code string `2.1.228 (Claude Code)\n` (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/execution-preflight.ts:33-36`), while `claude --version` currently returns `2.1.231 (Claude Code)`. The asserted equality rejects that environment. Fixing the pin would modify a frozen preregistration and require re-freezing and independent re-review, even though Section 1 shows that no possible Run 5 branch changes this decision. The pin stays unchanged and Run 5 is not executed.

## 6. Reconsideration bar

Reconsideration requires power, not merely “more data.” A successor corpus must contain enough positive `SAME_ROOT` pairs for a preregistered gate to tolerate at least one miss and still have a useful sensitivity floor. Using the same two-sided 95% Wilson lower bound:

```text
Perfect performance:
  L(15,15) = 0.7961166990 < 0.80
  L(16,16) = 0.8063923195 >= 0.80
  minimum n = 16 positives

One tolerated miss:
  L(23,24) = 0.7975819352 < 0.80
  L(24,25) = 0.8045593626 >= 0.80
  minimum n = 25 positives
```

So perfect performance needs at least 16 positives for a 0.80 lower bound, while tolerating one miss pushes the minimum past 20 to **25 positives**. Run 3 produced only 3 positives, a 1/3 sensitivity-resolution step (`packages/coding-agent/experiments/review-finding-corpus-validation-run3/frozen/gold-pairs.json:124-132`). Those relations were single-operator adjudications (`packages/coding-agent/experiments/review-finding-corpus-validation-run3/frozen/report.md:29-31`) and remained contested enough to motivate Run 5's independent blind re-adjudication of all 16 pairs (`packages/coding-agent/experiments/review-finding-gold-readjudication-preregistration-run5/README.md:1-3`).

Reconsider only after a new corpus version and a new preregistration meet that positive-class bar and freeze a one-miss-tolerant gate before execution. This record does not design that successor experiment.

## 7. Limitations

- Run B was never executed.
- Run 5 was never executed.
- The Run 3 gold labels were never independently re-adjudicated; they remain single-operator relations.
- This is a negative result about this corpus and this gate. It is not proof that recurrence detection is impossible.

These limitations do not weaken the present contribution decision: the frozen experiment cannot support a core detector, and the proposed policy subsystem belongs outside core.
