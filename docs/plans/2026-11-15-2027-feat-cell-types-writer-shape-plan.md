---
title: A Cell That Writes Without Deciding - Plan
type: feat
date: 2026-11-15
topic: cell-types-writer-shape
artifact_contract: ce-unified-plan/v1
product_contract_source: maintainer-order
execution: code
---

# A Cell That Writes Without Deciding - Plan

This plan was written after U1's code, to record the decision. U2 and U3 are still ahead.

## Goal Capsule

- **Objective:** A tagged decision in a cell-architecture codebase always marks a domain choice. When a reader or reviewer sees a `Workflow.make`, it chose an outcome that changes what the program does, and any operation that only lays out what it read has no decision to defend or test.
- **Means:**
  - `effect-cell-types` gains a cell shape with no decide step (KTD1).
  - The cell-architecture and property-testing packs state what a decision is (KTD4).
  - A lint keeps workflows inside cells (KTD5).
- **Product authority:** the maintainer's order of 2026-11-15:
  - summarizing a report is not a decision;
  - a property test that restates a decision's branch table is not a test;
  - decisions run only through a cell's `.decide`.
- **Supersession:** this plan reopens `2026-08-13-002-feat-phase-order-as-description-plan.md` KTD12.
  - KTD12 declined a variant that stops after decide, because no caller wanted it.
  - This plan adds the opposite variant, read then write with no decide. Five callers need it (Problem Frame).
  - KTD12 still holds for the variant it was written about.
- **Stop conditions:**
  - **Done:** every consumer reporter that decides nothing runs on `Sandwich.writer`, and the workflow-reference lint passes in this repository and in `stryker-js-effect` with an empty legacy list.
  - **Not done:** any of the following does not meet the Objective:
    - a decide-less cell built by passing an identity workflow to `.decide`;
    - a disable comment;
    - a legacy list that does not shrink.
- **Execution profile:** three PRs in this repository, one per unit. Consumer adoption happens in `stryker-js-effect` under its own plans. Agents author the PRs, and the maintainer's lead merges them after review.

## Product Contract

### Summary

`Sandwich.named(name)(read).decide(workflow).write(handlers)` was the only way to build a cell. It is also the only way to get:

- the cell span;
- the `<name>.read` and `<name>.write` child spans;
- the command's declared span attributes;
- the `app.<name>.duration` histogram with its `result_class`;
- the `CommandRejected` decode.

An operation with nothing to decide, such as a reporter laying out a result, could have that telemetry only by inventing a decision.

`Sandwich.writer(name)(read).decode(Command).write({ Decoded, CommandRejected })` gives the same telemetry without a decide step. The packs and a lint then make a decision mean one thing.

### Problem Frame

Measured on `stryker-js-effect` `main` on 2026-11-15:

- **Invented decisions.** Five reporter cells (clear-text, json, progress, sarif, html) each decide through a workflow whose tags differ only in what text is written, or in whether anything is written. One example is `ClearTextReportSummarized | ClearTextReportDetailed | ClearTextReportSuppressed`, computed by about 130 lines of field projection.
- **Branch-restating tests.** The property-testing pack asks for a property per decision tag, stating when the tag is chosen and when it is not. For an invented decision, the only such property is a test that recomputes the branch: an `expectedTag` function, or a tag table. Such a test passes whatever the code does.
- **Workflows outside cells.** 126 source workflows exist, and 31 are some cell's `.decide`. Of the other 95:
  - about 30 are called from inside a cell's read or write code;
  - about 55 are called from handles, services, plain modules and blueprints;
  - 2 are composed by another workflow.

  The README says a workflow "is still a plain function … you can call it directly". It meant tests, but nothing limits that statement to tests. A decision called this way gets no cell telemetry, and hand-written branching in shell code acts on its outcome.
- **Pack examples.** The cell-architecture pack's presentation entry uses `ReportSummarized | Suppressed` as its RIGHT example. It teaches the invented decision.

### Requirements

**Cell shape**

- R1. `Sandwich.writer(name, options?)(read).decode(Command).write(handlers)` builds a cell whose `phases` is `['read', 'decode', 'write']`. `read` returns the command's `Encoded` form, and the library decodes it with `Command`. A `read` whose result is not assignable to `Command['Encoded']` gets the same `ReadNotEncoded` type error that `named` gives.
- R2. `handlers` carries exactly two handlers:
  - `Decoded`, which receives the decoded command;
  - `CommandRejected`, which receives the rejection.

  Both also receive what `read` returned. The cell's success, error and service channels are the union of what the two handlers return, joined with `read`'s.
- R3. A writer run emits:
  - the cell span, named for the cell;
  - `<name>.read` and `<name>.write` child spans;
  - `cell.name` and `cell.stacktrace`;
  - the command's declared attributes, `cell.command_tag`, `cell.member_tags` and `cell.declared`.

  It emits no `app.<name>.decision`, `app.<name>.failure` or `cell.decide_stacktrace`.
- R4. A writer run records into `app.<name>.duration`, and each run is labelled with one `result_class`:
  - a decoded run is `success`;
  - a rejected command is `failure`;
  - a run whose read or write fails, or that is interrupted, is `infrastructure`.

  This is the same rule `named` uses.
- R5. `named`'s behaviour, types and telemetry are unchanged.

**What a decision is**

- R6. The cell-architecture pack defines a decision as a `Workflow.make`, run by a cell's `.decide`, whose tags lead the write phase to different domain effects. Domain effects are:
  - an exit code or verdict;
  - persisting or skipping a domain record;
  - running, retrying or dropping work;
  - a state transition.

  A verdict reached against a threshold or policy is a decision, even when a report is its only reader today. Laying out an outcome that was decided elsewhere is presentation, including machine-readable formats such as JSON or SARIF that another system later acts on, and including writing no report. An operation whose only branch is presentation is a writer cell that calls a plain formatter. The presentation entry's RIGHT example becomes a writer.
- R7. The property-testing pack:
  - requires per-tag properties only for decisions under R6;
  - names branch-restating oracles (`expectedTag`, tag tables) as violations;
  - keeps schema-drawn law properties (partition, finiteness, additivity) for projections and formatters.

**Where a workflow runs**

- R8. A `Workflow.make` value may be referenced only in three places:
  - as the argument of `.decide`;
  - inside another `*.workflow.ts`;
  - in a test file, or inside an in-source `if (import.meta.vitest)` block.

  A `*.workflow.ts` export that calls a workflow, or that holds one in an object, array or default export, is itself a reference outside a cell, and so is a namespace, computed, aliased or re-exported access. Any other reference is a lint error. A repository adopting the rule lists its current offenders by file and reference, and the list may only shrink.

### Scope Boundaries

- No change to `Workflow.make`, `Blueprint` or `Handle`.
- No decide-less variant of `Blueprint`.
- No stop-after-decide variant (2026-08-13-002 KTD12 stands).
- Consumer migrations happen in the consumer repositories.

## Planning Contract

### Key Technical Decisions

- KTD1. **A separate `writer` entry point, not an optional `.decide`.**
  - `ReadChain` keeps its single `.decide` member, so the sentence a `named` chain reads as stays fixed.
  - `writer` returns a `WriterReadChain` whose only member is `.decode`, and that returns a chain whose only member is `.write`: one call per phase, in phase order, as 2026-08-13-002 lays out for `named`.
  - The choice of shape is visible at the call's first token, and a reviewer sees `writer` where they would otherwise check whether a decision is real.
- KTD2. **`.decode(Command)` names the decode phase and carries the schema.** With no workflow, nothing else carries the schema the library decodes with. Taking it in its own `.decode` call keeps the decode a library step, reports `ReadNotEncoded` at that call rather than at a later one, and leaves `.write(handlers)` the same call in both shapes. The first draft took the schema as `write`'s first argument; the adversarial review showed that folded two phases into one call.
- KTD3. **The two handlers are named `Decoded` and `CommandRejected`, not keyed by the command's `_tag`.**
  - A writer has one success path. Keying it by the command tag would let a tagged-union command look like a decision table.
  - `CommandRejected` keeps the name `named` uses, so a rejection reads the same in both shapes.
- KTD4. **The definition lives in the packs, not in a type.**
  - Whether a tag leads to a different domain effect depends on what the write handlers do, which no type of this library can express.
  - The packs state the definition, and review applies it (R6, R7).
- KTD5. **The workflow-reference lint is syntactic.**
  - It resolves an imported binding to a `Workflow.make` export and reports every reference outside the three allowed sites (R8).
  - It does not follow values through other bindings: a workflow passed through a variable is reported at that variable's source reference.
  - Before it merges, it gets an adversarial review for brittleness.
- KTD6. **`monitoredRun` is shared, and a writer passes no decide stacktrace.** `annotateCellIdentity` writes `cell.decide_stacktrace` only when one is given. Both shapes keep one code path for span, histogram and `result_class`, so R4 cannot drift between them.
- KTD7. **The straight-line shell rule covers the writer chain.** The rule keys a cell on its builder and middle call: `named` with `.decide`, and `writer` with `.decode`. It reads the builder whether options come first, `writer(options)(name)(read)`, or last. It reads only a chain written as one expression: a chain split across `const` bindings is not checked, for `named` as for `writer`. That limit predates this plan, and closing it is its own follow-up. Without this, a writer would be a place to put domain branching with no decision, no decision telemetry and no lint (R9).

### Sequencing

U1 ships first, because the consumer migrations and U2's examples need it. U2 and U3 are independent of each other. U3's legacy list is measured when U3 starts.

## Implementation Units

### PR group 1: the writer shape

**Waits on:** nothing.

### U1. `Sandwich.writer`

- **Goal:** R1–R5, R9.
- **Files:**
  - `packages/effect-cell-types/src/Sandwich.ts`;
  - `packages/effect-cell-types/etc/effect-cell-types.api.md`;
  - `packages/effect-cell-types/tests/writer.integration.test.ts` and `writer-release.conformance.test.ts`;
  - `packages/effect-cell-types/test-types/writer-surface.tst.ts`;
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/sandwich-shell-is-straight-line*` and its tests;
  - `packages/effect-cell-types/tests/__fixtures__/print-report.schema.ts`;
  - `packages/effect-cell-types/README.md`;
  - minor change intents for `@systemfsoftware/effect-cell-types` and `@systemfsoftware/oxlint-plugin-cell-architecture`.
- **Approach:** KTD1, KTD2, KTD3, KTD6, KTD7.
- **Test scenarios:**
  - A decoding command reaches `Decoded` in the `<name>.write` span under the cell span, with what `read` returned. The cell span carries `cell.name`, `cell.command_tag` and the declared attribute, and no decision attribute or decide stacktrace. `phases` is `['read', 'decode', 'write']`, and the run is filed `success`.
  - A command that fails its schema reaches `CommandRejected` in the write span, with what `read` returned. `cell.outcome` is `CommandRejected`, and the run is filed `failure`.
  - A failing read and a failing write each fail the run and are filed `infrastructure`.
  - A writer run stopped at every step is still filed under how it ended (conformance).
  - Types: the cell joins the channels of `read` and both handlers; a `read` that does not yield the encoded command is refused at `.decode`; a handler record missing a handler is refused.
  - The shell rule passes a straight-line writer, and reports a branching writer `read` and a branching writer handler.
  - The existing `named` tests and the interruption conformance test pass unchanged (R5).
- **Verification:** the package's typecheck, lint, test and api check are green.

### PR group 2: pack text

**Waits on:** U1 merged, because the examples use `writer`.

### U2. Decision definition in the packs

- **Goal:** R6, R7.
- **Files:**
  - `compound-packs/cell-architecture/presentation-is-a-formatter-the-write-phase-calls.md`;
  - `compound-packs/property-testing/workflow-properties-tie-each-decision-to-the-command.md`;
  - the cell-architecture pack's index entry for the definition.
- **Approach:** KTD4.
- **Test scenarios:**
  - The presentation entry's RIGHT example compiles against the released `writer`.
  - No pack example uses a decision whose tags differ only in presentation.
- **Verification:** the packs' own link and example checks pass.

### PR group 3: the lint

**Waits on:** U1 merged.

### U3. `workflow-runs-only-in-a-cell`

- **Goal:** R8.
- **Files:**
  - `packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/` (the rule, its config and its tests);
  - the recommended config entry.
- **Approach:** KTD5.
- **Test scenarios:**
  - Each of the following is reported:
    - a reference from a handle;
    - a reference from a service;
    - a reference from a plain module;
    - a reference from a cell's read or write handler.
    - a call from a non-workflow export of a `*.workflow.ts`;
    - a namespace, computed, aliased or re-exported reference;
    - an object, array or default export of a `*.workflow.ts` that holds a workflow;
  - None of the following is reported:
    - a reference as `.decide(x)`;
    - a reference from another `*.workflow.ts`;
    - a reference from a test file or an in-source `import.meta.vitest` block.
  - A listed offender is not reported, and a new reference in a listed file is.
- **Verification:** the plugin's tests are green, and the rule runs across this repository with only listed findings.

## Verification Contract

From the package directory, inside `nix develop`:

- `pnpm exec tsc -b`;
- `pnpm run lint`;
- `pnpm vitest run`;
- `pnpm run test:types`;
- `pnpm exec tsdown -l warn && pnpm run api:check`.

On the consumer side, `stryker-js-effect`'s clear-text, progress and JSON reporters, moved to `writer`, produce the same output on its calc fixture as before the move.

## Definition of Done

- **U1:** `writer` is released, and its scenarios pass three runs in a row.
- **U2:** both pack entries are merged, and their examples compile.
- **U3:** the rule is merged with this repository's legacy list empty, and `stryker-js-effect` has adopted it with a list that shrinks in each consumer PR.
- **Overall:** the Goal Capsule's Done condition holds, and no code from abandoned approaches remains in any of the three diffs.

## Appendix

### Adversarial review of U1

On 2026-11-15, the U1 diff and this plan were given to a model from a different family. It was told to assume the change was wrong. Its verdict was not to ship, and each finding was checked against the code:

| Finding                                                                                                                         | Outcome                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WriterHandlerRecord`'s single `Out` parameter rejects handlers whose channels differ                                           | Refuted. It is the same pattern as the existing `HandlerRecord`. `write` infers the record's literal type, and a type test shows the success, error and service channels joined.                 |
| The `<name>.write` and `<name>.read` spans are untested, and `settle('success')` runs before the write                          | Partly accepted. The write span name is now asserted. Settling before the write matches `named`: a run that then fails is recorded as `infrastructure`, and the failing-write scenario shows it. |
| `ReadNotEncoded` surfaces late                                                                                                  | Accepted with KTD2: it now surfaces at `.decode`.                                                                                                                                                |
| `.write(Command, handlers)` folds decode into write                                                                             | Accepted (KTD2).                                                                                                                                                                                 |
| A writer is an escape hatch for domain branching                                                                                | Accepted. The shell rule did not cover writers; it does now (R9, KTD7).                                                                                                                          |
| The decision definition misreads verdicts, machine-readable output and "skipping"                                               | Accepted as wording in R6.                                                                                                                                                                       |
| The workflow-reference lint can be bypassed through wrapper exports, namespaces and re-exports, and it misreads in-source tests | Accepted into R8 and U3's scenarios.                                                                                                                                                             |
| Tests miss phases, the raw argument, read failure, interruption and the type gates                                              | Accepted. All are now covered.                                                                                                                                                                   |

A second round on the revised diff found these:

| Finding                                                                                                                      | Outcome                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The shell rule misses the options-first form `writer(options)(name)(read)`                                                   | Accepted. It read only the name-first form, for `named` as well. It now reads both, with tests for each builder. |
| The shell rule misses a chain split across `const` bindings                                                                  | Recorded as a known limit in KTD7. It predates this plan and applies to `named` the same way.                    |
| `<name>.read`, `cell.stacktrace`, `cell.member_tags`, `cell.declared` and the absence of `app.<name>.failure` are unasserted | Accepted. All are now asserted.                                                                                  |
| No writer test reports a branching `CommandRejected` or a `Match` pipeline                                                   | Accepted. Both are now tested.                                                                                   |
| R8 misses workflows held in exported containers or default exports, and aliased imports                                      | Accepted into R8 and U3.                                                                                         |
