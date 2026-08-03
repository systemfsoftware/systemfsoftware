# @systemfsoftware/oxlint-plugin-effect-handler

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-handler?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-handler)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-handler?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want handler files that stay thin transport terminuses.

```
x @systemfsoftware/effect-handler(handler-single-executor): get-user.handler.ts is forbidden.
  Expected: exactly one import of a sibling *.executor and one Effect.either(Executor(cmd)) delegation.
  Actual: no import of a sibling *.executor.ts.
  Fix: construct the executor command and call yield* Effect.either(Executor(cmd)) — the executor owns the I/O sandwich.

x @systemfsoftware/effect-handler(handler-no-switch): switch is forbidden.
  Expected: a Match.tag dispatch closed by Match.orElse(() => 500).
  Actual: a switch statement.
  Fix: map each typed error variant to its status with Match.type(...).pipe(Match.tag(...), ..., Match.orElse(() => 500)).

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-handler
```

## The Problem

A `*.handler.ts` is meant to be the thin, outermost edge of the imperative shell: decode the request into one typed command, call exactly one executor, and translate the executor's result back into a transport response. Add a store import, an `as` cast, a `switch` on `_tag`, or a second executor and it still compiles, still passes a standard lint config, and still passes its tests. The violation is only wrong relative to a convention no tool knows about, and it surfaces later as business logic that is untestable without a running server.

These five rules make that convention executable. Every rule is inert on any file not named `*.handler.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectHandler from '@systemfsoftware/oxlint-plugin-effect-handler'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-handler'],
  rules: { ...effectHandler.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-handler/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                        | Reports                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler-single-executor`   | No sibling `*.executor` import, or more than one; no `Effect.either(Executor(cmd))` delegation call, or more than one — the handler owns no I/O and no orchestration                |
| `handler-no-casts`          | An `as` type assertion (except `as const`) or an angle-bracket `<T>` assertion — the request must be decoded through a Schema codec, never cast                                     |
| `handler-no-switch`         | Any `switch` — error-to-status mapping goes through `Match.tag` closed by `Match.orElse(() => 500)`, and a switch on `_tag` is easy to leave incomplete when a new variant is added |
| `handler-match-tag-or-else` | A `Match.tag` dispatch that lacks a `Match.orElse` arm, or that terminates in `Match.exhaustive` — a new error variant must degrade to a 500 at runtime, not fail the build         |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-handler'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.handler.ts` files are examined.

**Q: Diagnostics say `@systemfsoftware/effect-handler(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

**Q: Why does `handler-match-tag-or-else` demand `Match.orElse` when `effect-workflow` demands `Match.exhaustive`?**
A: The cells disagree by design. A workflow is a pure decision — a new variant must fail to compile. A handler maps errors to transport statuses — a new error variant must degrade to a 500 at runtime rather than take the server down with a build failure. Each rule enforces its own cell.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-handler/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
