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

These two rules make that convention executable at the boundary that constructs the decision — the body of a `Workflow.make(...)` call — not at a filename.

**Shape is not policed here.** What a decision must declare is decided by the mechanism that builds the workflow and the compiler it runs under, not by a walker reading the finished file. Channel inhabitation is refused by `Workflow.make`: its `Inhabited` constraint resolves a `never` decision or error channel, or an error channel carrying no `_tag`, to a marker whose member name is the diagnostic — `__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__` — so a decision that cannot succeed, or whose failure carries nothing a consumer can dispatch on, does not compile. `async` and ambient impurity are refused by the Effect language-service policy every package inherits from this repo's shared config.

## Quick Start

```ts
// oxlint.config.ts
import effectWorkflow from '@systemfsoftware/oxlint-plugin-effect-workflow'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-workflow'],
  rules: { ...effectWorkflow.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-workflow/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                        | Reports                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-match-exhaustive` | `Match.orElse` in a `Match.tag` pipe; `Match.orElse` as the fallback of a predicate or literal dispatch over an open type (close the variant type first); or a `Match.tag` dispatch with no `Match.exhaustive` — all scoped to a `Workflow.make` argument body |
| `make-body-purity`          | A reference inside a `Workflow.make` argument body that resolves to I/O — an impure import, a module-level mutable, a mutable local, or an ambient global; and control-flow keywords past the one converging first-statement guard                             |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-workflow'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Both rules are boundary-scoped. Only `Workflow.make` argument bodies are examined — the suffix of the file carrying the call is not a key.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-workflow/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
