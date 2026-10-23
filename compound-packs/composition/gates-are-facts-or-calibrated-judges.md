---
title: Every composition rule is enforced on every change by a compiler fact or by a judge calibrated to kappa 0.7 or more, never by review alone or by a text pattern
applies_when:
  - adding or changing a rule in this pack, or a check in scripts/tools/repo-checks
  - wiring the composition checks into CI or a pre-commit hook
  - a judged check's rubric, panel models or evidence fields change
  - a rule says "review" or names a gate that does not exist
tags: [composition, enforcement, ci, judge, calibration, kappa]
---

## Rule

A composition rule holds only if a machine checks it on every change.

- **Fact-gated** where a fact can decide: the TypeScript compiler's import graph built from each unit's own tsconfig (type-only imports told apart), the `exports` resolver that follows conditions and `*` patterns (`scripts/tools/repo-checks/package-exports.ts`), the syntax tree and the type checker, git history. A fact must entail the violation; an import inside a string or comment is not an import, and a name alone (a parameter called `env`) decides nothing.
- **Judge-gated** where the law is a judgement (is this entry a role, should this library split). The facts become structured evidence; a per-rule rubric goes to a panel of two models; each answers evidence first, then `holds`, `violated` or `uncertain`, then a confidence. `violated` and `holds` need both members; anything else is `uncertain`, which is reported and never fails. A judged rule may fail CI only while its Cohen's kappa against labelled cases is at least 0.7 for the current rubric, panel and evidence shape (a fingerprint of all three), and its labels and rubric agree with the current text of the rule it enforces; a stale, low or out-of-date calibration reports only.
- **Never a regex over source text**, and never `review` as the only gate. A rule with no gate yet says "Gate: none yet" and names the fact the gate would read.
- **The checks run where changes land**: the same command in CI on every pull request as locally.

## Why

Review let younna-ai grow a 136-entry Worker surface with 61 dead entries and library-to-Worker imports while six of the seven package-topology rules were gated by `review` ((pack: composition, evidence/FINDINGS.md) Cycles 006-007). Every source with a boundary that held enforced it mechanically: Rat Stack's oxlint fence run pre-commit and in CI, Deno std's four checker scripts, Effect's custom oxlint rules and madge, TanStack's knip and sherif in `test:pr` ((pack: composition, evidence/FINDINGS.md) Cycles 000-005; (pack: composition, evidence/PACK.md) Part 3, row 5).

## Evidence

- The checks: `scripts/tools/repo-checks/cli.ts` registers `composition-unit-kinds`, `composition-graph`, `composition-entries`, `composition-imports`, `composition-contracts`, `composition-core-adapters`, `composition-granularity` (fails only with `--strict`) and `composition-calibrate`. Exit 0 holds, 1 violated, 2 undecided.
- The judge: `scripts/tools/repo-checks/composition-judge.ts` (rubrics, panel `~deepseek/deepseek-flash-latest` and `google/gemini-3.8-flash`, override with `REPO_CHECKS_JUDGE_MODELS`; `OPENROUTER_API_KEY` required, otherwise judged rules report their candidates unjudged).
- Calibration, replayed 2026-10-23 with `repo-checks composition-calibrate` over `scripts/tools/repo-checks/calibration/cases.jsonl` (121 cases from younna-ai, TanStack, Vitest, effect-smol, rat-stack, tRPC, Jotai, Astro and others) and `calibration/recorded.jsonl`. The kappa column is `calibration/kappas.json`. The second-rater column is Cohen's kappa between the labels in `cases.jsonl` and a blind model rater's labels in `calibration/second-rater.jsonl` (recomputed 2026-10-23 from those two files):

| Judge                | Cases | Kappa | Labels vs blind second rater | Authoritative under this pack                    |
| -------------------- | ----- | ----- | ---------------------------- | ------------------------------------------------ |
| `entries-are-roles`  | 29    | 0.74  | 0.51                         | no, report only until relabelled and re-recorded |
| `test-only-exports`  | 37    | 0.79  | 0.73                         | no, report only until relabelled and re-recorded |
| `granularity`        | 32    | 0.78  | 0.77                         | yes; fails only with `--strict`                  |
| `core-adapter-split` | 23    | 0.42  | 0.36                         | no; the code reports only (kappa below 0.7)      |

- Limits of that calibration: the labels are one author's; the second rater is a model; rubrics were refined against the same cases, so the kappas are in-sample; and the `entries-are-roles` and `test-only-exports` rubrics still label `./testing` and driver keys legitimate, which (pack: composition, role-entries-only.md) and (pack: composition, tests-stay-home.md) forbid. Until those cases are relabelled, the rubrics changed and the calibration re-recorded with `composition-calibrate --record --write`, those two judges are not authoritative, whatever their recorded kappa. Known gate defect: `composition.ts` reads only the kappa, so it still lets a violated verdict from either fail the check; demoting them in code (or relabelling and re-recording) is the fix.

## Wrong / right

```text
WRONG: "Gate: review." / "Gate: CI job template-isolation" (no such job exists) / a grep for 'process.env'.
RIGHT: "Gate (fact-gated): repo-checks composition-graph fails a library that references process.env ..."
RIGHT: "Gate: none yet. It would read <the fact> from <the tool>."
```

## Gate

Gate: none yet in this repository's CI. `.github/workflows/ci.yml` runs `repo-checks single-plan` and `changeset-check.yml` runs `repo-checks packed-manifest`, but no workflow runs any `composition-*` check. The fact the gate reads is the CI configuration: a workflow step on every pull request that runs `nix run .#repo-checks -- composition-unit-kinds composition-graph composition-entries composition-imports composition-contracts composition-core-adapters composition-granularity --strict` with `OPENROUTER_API_KEY` set, and fails on exit 1.
