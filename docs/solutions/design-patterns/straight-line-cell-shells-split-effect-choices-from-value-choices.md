---
title: Straight-line cell shells — turn effect choices into decisions and value choices into pure functions; never relocate the branch
date: 2026-09-25
category: design-patterns
module: api-extractor
problem_type: design_pattern
component: cell-architecture
severity: high
applies_when:
  - "`sandwich-shell-is-straight-line` reports a ternary, if, &&/||, Match pipeline, Option.match, or Result.match inside a Sandwich read or write phase"
  - porting an imperative pipeline (a CLI, a compiler driver, a report writer) into Sandwich cells
  - a cell's read phase has grown past a few dozen lines
symptoms:
  - dozens of straight-line violations in one large read phase
  - the tempting fix is to move the phase body into a sibling module, where the rule stops reporting
related_components:
  - oxlint-plugin-cell-architecture
  - effect-cell-types
tags:
  - sandwich
  - cell
  - workflow
  - straight-line-shell
  - lint-evasion
  - kernel-boundary
---

## Context

`@systemfsoftware/cell-architecture(sandwich-shell-is-straight-line)` (added in #511) refuses every branch inside a Sandwich `read` or `write` phase. It resolves the phase's functions through `kernel-boundary.functionValueOf`, which sees same-file functions only. The rule's own test case `Should_Pass_When_ReadHelperLivesInAnotherFile` records the cross-file case as KTD15's declared blind spot, with "the whole-package aim is the backstop there".

When the api-extractor package was restarted from PR #462, its cells had been written before the rule existed and failed it at 15 sites. The first fix moved the 1100-line read and write bodies of `extract-api.cell.ts`, plus the bodies of `announce-run.cell.ts` and `locate-config.cell.ts`, into sibling modules. Lint went green and nothing about the architecture changed. The fix was rejected: the blind spot is a limit of the instrument, not permission. The review of that tree also found a real bug the relocation had hidden. Verbose report lines bypassed the quiet filter because three emit sites wrote straight into the plan.

## Architectural Invariants

- **One path per phase.** A Sandwich phase body executes; it never chooses. Every choice about _which_ effects run is a decision variant returned by the cell's `decide` workflow, and the matching handler runs exactly one path.
- **Relocation is not reduction.** Moving a branch to another module changes which file the lint reads, not whether the phase branches. A shell phase is straight-line only when every function it calls is either another cell or a pure data-in/data-out function.
- **Plans are data, filters apply once.** When a write phase executes a plan, cross-cutting policy (verbosity, dry-run, ordering) is applied to the finished plan, never at each emit site.

```text
before:  read = (input) => cond ? readA : readB          // phase chooses
after:   read = (input) => gatherBoth                    // phase gathers
         decide = (evidence) => cond ? UseA() : UseB()   // workflow chooses
         write = { UseA: runA, UseB: runB }              // each handler runs one path
```

## Guidance

Classify each reported site before moving anything.

1. **Effect choice.** The branch decides whether or which I/O runs: read a file or not, load a compiler folder or the bundled one, write a step or skip it. This is a decision. Give it a `*.workflow.ts` built with `Workflow.make`, with at least two `Schema.TaggedClass` variants sharing one TypeId. Compose cells with `Cell.andThen`/`Cell.flatMap`, so each read gathers what it needs unconditionally and each write handler, keyed by variant tag, runs one path. In api-extractor, choosing between the explicit `--config` path and the searched one became `choose-config-source.workflow.ts` (`ExplicitConfigSource` | `SearchedConfigSource`) with `locate-config.cell.ts` composing two cells.
2. **Value choice.** The branch computes a value from data already read: pick a default path, normalize a token, pick the tsdoc-metadata target. It may live in a pure module whose functions take data and return data, with no `Effect`, service, or `FileSystem` in any signature. api-extractor's `extraction-snapshot.ts` and `extraction-write-plan.ts` are this shape: the write plan is data (`EmitLine` / `EnsureDirectory` / `WriteFile` steps), and the write phase executes it with a straight `Effect.forEach`.
3. **Check a relocation by signature, not by lint.** A helper module outside `*.cell.ts`, `drivers/`, and `main.ts` that both touches an I/O service and branches on what to execute is a relocated shell phase, whatever the lint says. Grep the helper's imports and signatures. A pure module imports no `FileSystem`, `Path` service, `MessageWriter`, or compiler service.

A plan built as data also gives you one place to apply a cross-cutting filter. api-extractor applies verbosity once, at the end of `buildWritePlan` (`Arr.filter(draft.lines, (line) => admits(verbosity, line.level))`), and pins it with the in-source property `∀p_QuietCleanRun_⊥Lines`. With per-site filtering, every new emit site has to remember the filter.

## Applicability

This applies to any package whose cells predate #511 or port an imperative engine. It does not apply to value computation inside a workflow `decide`, which the dmmf-workflow rules govern instead (no control-flow keywords, only `Match.exhaustive`).
