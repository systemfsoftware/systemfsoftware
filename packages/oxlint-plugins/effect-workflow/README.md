# @systemfsoftware/oxlint-plugin-effect-workflow

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-workflow)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want workflow files that stay pure decisions.

```
x @systemfsoftware/effect-workflow(workflow-no-panic-vocabulary): UnexpectedError is forbidden.
  Expected: error variants named for expected domain failures a consumer can dispatch on.
  Actual: panic vocabulary as a domain name.
  Fix: name the failure, or move it out of the error channel entirely.

x @systemfsoftware/effect-workflow(workflow-match-exhaustive): Match.orElse is forbidden.
  Expected: Match.value(...).pipe(Match.tag(...), Match.exhaustive).
  Actual: a fallback arm over a closed union.
  Fix: dispatch exhaustively over a closed tagged union so a new variant fails to compile.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-workflow
```

## The Problem

A `*.workflow.ts` is meant to be the pure core of a business decision — typed command in, tagged decision out. Add a `Date.now()`, an `if`, a `throw`, or a database import and it still compiles, still passes a standard lint config, and still passes its tests. The impurity is only wrong relative to a convention no tool knows about, and it surfaces months later as a test that cannot be written without mocking a clock.

These four rules make that convention executable. Every rule is inert on any file not named `*.workflow.ts`.

**Shape is not policed here.** What a `*.workflow.ts` must declare is decided by the mechanism that builds the workflow and the compiler it runs under, not by a walker reading the finished file. Channel inhabitation is refused by `Workflow.make`: its `Inhabited` constraint resolves a `never` decision or error channel, or an error channel carrying no `_tag`, to a marker whose member name is the diagnostic — `__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`, `__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__` — so a workflow that cannot succeed, or whose failure carries nothing a consumer can dispatch on, does not compile. `async` and ambient impurity are refused by the Effect language-service policy every package inherits from `packages/tsconfig/effect.json`: `asyncFunction`, `globalDate`, `globalRandom`, `globalFetch`, `globalConsole`, `globalTimers`, `processEnvInEffect`, `cryptoRandomUUID` and their `*InEffect` forms are at `error`, so a decider that awaits, reads a clock, draws randomness or touches the environment is a compile error too. The rest of the upstream list nothing carries: the `throw` prohibition, export cardinality and declaration form are recorded as orphans in `docs/2026-08-15-orphaned-cell-constraints.md` (rows O3, O8, O10), and TypeId placement is owned by nothing and not listed there either. What remains is what the compiler cannot decide — an import edge, an identifier's vocabulary, the freedom of an emitted dispatch — plus one rule over the hand-authored test files.

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

| Rule                           | Reports                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflow-no-panic-vocabulary` | An error variant named `Unexpected*`, `Impossible*`, `Unreachable*`, or `Invariant*` with no domain noun                                                                                                                                                                                                                                               |
| `workflow-match-exhaustive`    | `Match.orElse` in a `Match.tag` pipe; `Match.orElse` as the fallback of a predicate or literal dispatch over an open type (derive a closed variant with a total constructor first); or a `Match.tag` dispatch with no `Match.exhaustive`. The one survivor is an `orElse` preceded by an object-literal record arm — the small open record of booleans |
| `workflow-no-effect-import`    | The `effect` barrel and `effect/Effect` (the runtime). Other `effect/*` submodules are permitted because they are pure value-level modules and a workflow is a pure decision                                                                                                                                                                           |
| `workflow-property-test-shape` | A workflow test outside `__tests__/*.property.test.ts`, or one using plain `it`, raw `fc.assert`, or `it.effect.prop` instead of `it.prop`                                                                                                                                                                                                             |

`workflow-inline-schemas` ships registered but not recommended: an import from a sibling `*.schema.ts` matching the workflow's name. Enable it by name where single-consumer types should stay inline.

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-workflow'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.workflow.ts` files are examined.

**Q: Diagnostics say `@systemfsoftware/effect-workflow(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-workflow/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
