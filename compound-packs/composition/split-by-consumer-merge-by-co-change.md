---
title: Split a library when its consumers use disjoint halves or different runtimes, merge two libraries that always change together, and keep single-consumer code inside its consumer
applies_when:
  - deciding whether new code needs its own package
  - a package has grown two unrelated responsibilities
  - two packages are edited in the same commits again and again
  - a private library has one dependent or none
tags: [composition, granularity, split, merge, packages]
---

## Rule

A library boundary exists so things can change independently.

- **Split** a library when its consumers fall into groups that use disjoint parts of it, or when one part must run where the other cannot (pack: composition, core-and-adapters.md).
- **Merge** two libraries when their history shows they change together.
- **Keep inside** the consumer any code with one consumer and no second use, until a second consumer appears. A driver follows the same rule (pack: composition, drivers-live-where-chosen.md).
- A private library nobody imports is deleted, unless it is run or read rather than imported: a `bin`, a deployed entry, a runner invoked by its own scripts, configuration read as data, or a toolchain another unit declares.

## Why

Too few boundaries give god-packages every consumer must take whole; too many give micro-packages where every change is a multi-package edit. Both are measurable: consumer overlap from the import graph, co-change from history. The younna-ai census shows the drift: the fully-used packages were small (`billing` 18/18, `connections` 9/9) and the large ones carried most of the dead surface ((pack: composition, evidence/FINDINGS.md) Cycle 006, finding 4, at the 2026-10-21 snapshot).

## Evidence

- Deno std keeps many small packages working only with per-package ownership and mechanical checks (`std/_tools/check_mod_exports.ts`, `std/_tools/check_circular_package_dependencies.ts`; (pack: composition, evidence/FINDINGS.md) Cycle 002).
- TanStack keeps cross-library integration as its own package (`router/packages/react-router-ssr-query`) so neither library learns about the other ((pack: composition, evidence/FINDINGS.md) Cycle 000, finding 4).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```text
WRONG: packages/format-date, used only by apps/web, edited in the same commit as apps/web 9 times in 10.
RIGHT: the code lives in apps/web/src/format-date.ts until a second application needs it.
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Judge-gated, `granularity`: `repo-checks composition-granularity` (`scripts/tools/repo-checks/composition.ts`) collects candidates from facts (a library with at most one dependent; a pair changed together in more than 80% of the last 50 commits touching either, with at least 10; dependents using disjoint entries) and sends each with its `bin`, deploy configs, script names, source file count and dependents' import facts to a panel of two models (`~deepseek/deepseek-flash-latest`, `google/gemini-3.8-flash`; `OPENROUTER_API_KEY` required). Each answers evidence first; `violated` needs both members; `uncertain` only reports. Calibration (`scripts/tools/repo-checks/calibration/kappas.json`): kappa 0.778 over 32 labelled cases. A violated verdict fails only with `--strict`, and only for a unit whose `unit` is declared; otherwise it is reported.
