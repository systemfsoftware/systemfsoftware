# @systemfsoftware/oxlint-plugin-effect-workflow

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-workflow)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want decision bodies that stay pure.

```
x @systemfsoftware/effect-workflow(workflow-match-exhaustive): Match.orElse is forbidden.
  Expected: Match.value(...).pipe(Match.tag(...), Match.exhaustive).
  Actual: a fallback arm over a closed union.
  Fix: dispatch exhaustively over a closed tagged union so a new variant fails to compile.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-workflow
```

## The Problem

A business decision is meant to be a pure core — typed command in, tagged decision out. Add a `Date.now()`, an `if`, a `throw`, or a database import and it still compiles, still passes a standard lint config, and still passes its tests. The impurity is only wrong relative to a convention no tool knows about, and it surfaces months later as a test that cannot be written without mocking a clock.

These eight rules make that convention executable at the boundary that constructs the decision — the `decide` property of a `Workflow.make({ command, decision, error, decide })` call — at the file that holds it, and at the stem that names it.

**Shape is not policed here.** What a decision must declare is decided by the mechanism that builds the workflow and the compiler it runs under, not by a walker reading the finished file. Channel inhabitation is refused by `Workflow.make`: its `Inhabited` constraint resolves a `never` decision or error channel, or an error channel carrying no `_tag`, to a marker whose member name is the diagnostic — `__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__` — so a decision that cannot succeed, or whose failure carries nothing a consumer can dispatch on, does not compile. `async` and ambient impurity are refused by the Effect language-service policy every package inherits from this repo's shared config.

## Quick Start

```ts
// oxlint.config.ts
import dmmfWorkflow from '@systemfsoftware/oxlint-plugin-dmmf-workflow'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-dmmf-workflow'],
  rules: { ...dmmfWorkflow.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-dmmf-workflow/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                            | Reports                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make-file-location`            | A workflow construction (`Workflow.make`) in a file that is not a single-segment `<stem>.workflow.ts`, or a second construction in the same file. A `.tst.ts` type-test file runs nowhere, so it is out of scope                                                                                                                                                                                          |
| `workflow-match-exhaustive`     | `Match.orElse` in a `Match.tag` pipe; `Match.orElse` as the fallback of a predicate or literal dispatch over an open type (close the variant type first); or a `Match.tag` dispatch with no `Match.exhaustive` — all scoped to the `decide` body of a `Workflow.make` options object                                                                                                                      |
| `make-body-purity`              | A reference inside the `decide` body of a `Workflow.make` options object that resolves to I/O — an impure import, a module-level mutable, a mutable local, or an ambient global; and control-flow keywords past the one converging first-statement guard                                                                                                                                                  |
| `make-command-schema`           | A type assertion, laundering call, or `declare`d binding at the `command` property of a `Workflow.make` options object — the shapes `make`'s own type bound cannot refuse                                                                                                                                                                                                                                 |
| `workflow-file-export-topology` | A second non-schema value export from a single-segment `<stem>.workflow.ts`, a missing non-schema value export, or any re-export (`export * from`, `export { x } from`, `export { imported }`)                                                                                                                                                                                                            |
| `damp-workflow-stem`            | A `<stem>.workflow.ts` file whose stem is not a 2–5 token lowercase kebab phrase naming the decision, or whose stem is not the camelCase of the file's single non-schema value export                                                                                                                                                                                                                     |
| `workflow-file-make-presence`   | A `<stem>.workflow.ts` file with no workflow construction (`Workflow.make`)                                                                                                                                                                                                                                                                                                                               |
| `workflow-variant-constructed`  | A variant the decider's `Result.Result<…, …>` return annotation declares in its decision or error channel that no code path in the file constructs — `new X(…)` anywhere in the file or `X.make(…)` counts, so a variant named only in a comment or a string is reported. A variant whose class is imported rather than declared in the file is out of reach, and a `*.tst.ts` type probe is out of scope |

`workflow-file-export-topology`, `damp-workflow-stem`, and `workflow-file-make-presence` key on the filename and report nothing outside a single-segment `<stem>.workflow.ts`.

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-dmmf-workflow'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: `make-body-purity`, `workflow-match-exhaustive`, and `workflow-variant-constructed` are boundary-scoped — only the `decide` property of a recognized `Workflow.make` options object is examined, and it must be an inline function or a module-scope reference (shorthand included) in the same file. `workflow-variant-constructed` reports nothing unless the decider's return annotation declares a `Result.Result<…, …>` channel whose variants this file declares itself. `make-file-location` keys on the filename: it reports a `Workflow.make` call in a file that is not a single-segment `<stem>.workflow.ts`, or a second call in the same file. `workflow-file-export-topology`, `damp-workflow-stem`, and `workflow-file-make-presence` key on the same filename: outside a single-segment `<stem>.workflow.ts` they report nothing.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-workflow/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
