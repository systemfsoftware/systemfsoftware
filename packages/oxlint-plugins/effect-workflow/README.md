# @systemfsoftware/oxlint-plugin-effect-workflow

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-workflow)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-workflow?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want workflow files that stay pure decisions.

```
x @systemfsoftware/effect-workflow(workflow-schema-required): join-invite.workflow.ts is forbidden.
  Expected: Command, Decision, and Error declared as S.TaggedClass / S.TaggedError.
  Actual: no S.TaggedClass or S.TaggedError declaration.
  Fix: declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError.

x @systemfsoftware/effect-workflow(workflow-single-path): if is forbidden.
  Expected: Match.value(...).pipe(Match.tag(...), Match.exhaustive).
  Actual: an if statement.
  Fix: dispatch exhaustively over a closed tagged union so a new variant fails to compile.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-workflow
```

## The Problem

A `*.workflow.ts` is meant to be the pure core of a business decision — typed command in, tagged decision out. Add a `Date.now()`, an `if`, a `throw`, or a database import and it still compiles, still passes a standard lint config, and still passes its tests. The impurity is only wrong relative to a convention no tool knows about, and it surfaces months later as a test that cannot be written without mocking a clock.

These fourteen rules make that convention executable. Every rule is inert on any file not named `*.workflow.ts`.

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

| Rule                                | Reports                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-schema-required`          | No `S.TaggedClass`/`S.TaggedError` declaration; no `S.TaggedError` error channel — the workflow must declare an error variant and export a function returning `Either.Either<Decision, Error>` backed by it (a bare-union total decision is not a workflow); or fewer than two non-command variants — a one-outcome computation is a conversion, not a decision                 |
| `workflow-either-inhabited`         | A returned `Either` with a dead channel: an uninhabited left (`never`, `void`, `unknown`, a bare primitive, an unparameterized `Either`); a decision channel that is a single payload-free variant (that is `Option<Error>` in disguise — return the bare union instead); or an `Either.left` carrying a plain `new Error(...)` or a class that does not extend `S.TaggedError` |
| `workflow-inline-schemas`           | An import from a sibling `*.schema.ts` matching the workflow's name; single-consumer types belong inline                                                                                                                                                                                                                                                                        |
| `workflow-typeid-required`          | A schema class with no `readonly [XxxTypeId] = XxxTypeId` member                                                                                                                                                                                                                                                                                                                |
| `workflow-no-unconstructed-variant` | A variant declared but never constructed here; `*Command` declarations are exempt, since the caller builds those                                                                                                                                                                                                                                                                |
| `workflow-no-panic-vocabulary`      | An error variant named `Unexpected*`, `Impossible*`, `Unreachable*`, or `Invariant*` with no domain noun                                                                                                                                                                                                                                                                        |
| `workflow-match-exhaustive`         | `Match.orElse` in a `Match.tag` pipe; `Match.orElse` as the fallback of a predicate or literal dispatch over an open type (derive a closed variant with a total constructor first); or a `Match.tag` dispatch with no `Match.exhaustive`. The one survivor is an `orElse` preceded by an object-literal record arm — the small open record of booleans                          |
| `workflow-single-path`              | `if`/`switch`, any loop, and every ternary after the first; `&&`/`\|\|` are boolean data and pass                                                                                                                                                                                                                                                                               |
| `workflow-no-throw`                 | Any `throw` — a failure the caller handles belongs in the `Either` error channel                                                                                                                                                                                                                                                                                                |
| `workflow-no-async`                 | `async`, `await`, and `Promise` type references                                                                                                                                                                                                                                                                                                                                 |
| `workflow-no-ambient-impurity`      | `Date.now`, `new Date`, `Date.parse`, `Date.UTC`, `performance.now`, `Math.random`, `crypto.randomUUID` at any depth, those members destructured, plus `process.env`, `console.*`, `fetch`                                                                                                                                                                                      |
| `workflow-no-effect-import`         | The `effect` barrel and `effect/Effect` (the runtime). Other `effect/*` submodules are permitted because they are pure value-level modules and a workflow is a pure decision                                                                                                                                                                                                    |
| `workflow-single-function-export`   | Anything but exactly one exported function, counting `export { … }` specifiers and `export default`; exported constants, helpers, and wrappers are banned; schema classes, `S.Union`, TypeId symbols, and types are free                                                                                                                                                        |
| `workflow-property-test-shape`      | A workflow test outside `__tests__/*.property.test.ts`, or one using plain `it`, raw `fc.assert`, or `it.effect.prop` instead of `it.prop`                                                                                                                                                                                                                                      |

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
