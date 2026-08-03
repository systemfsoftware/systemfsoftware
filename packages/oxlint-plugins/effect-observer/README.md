# @systemfsoftware/oxlint-plugin-effect-observer

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-observer?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-observer)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-observer?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want observer machinery that stays on the test side of the frame.

```
x @systemfsoftware/effect-observer(observer-no-domain-imports): step-harness.observer.ts is forbidden.
  Expected: imports of operational modules only — effect/*, sibling *.observer modules, and vocabulary-free *.kernel helpers.
  Actual: an import of a domain cell (schema, workflow, executor, store, acl, adapter, handler, middleware, policy, state, or shape).
  Fix: reason in operational vocabulary — pass domain values in as fixture data, or extract the shared logic into a *.kernel.ts module.

x @systemfsoftware/effect-observer(observer-no-production-import): order.service.ts is forbidden.
  Expected: observer machinery imported only by test files, other observer modules, and tooling entrypoints.
  Actual: an import of the observer cell from a production file.
  Fix: move the harness call into a test or tooling entrypoint, or extract the shared behavior into a production cell so the gate stays independent.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-observer
```

## The Problem

A `*.observer.ts` file is the machinery observers run on — step harnesses, fixture builders, span recorders, test tooling. It reasons in operational vocabulary (Step, Effect, Span, Layer, Fixture), never domain nouns. Add a domain import, a module-level registry, or a production caller and it still compiles, still passes a standard lint config, and still passes its tests. The violation is only wrong relative to a convention no tool knows about, and it surfaces months later as a test suite that is order-dependent, or a "test helper" a production path silently depends on.

These four rules make that convention executable. Rules 1–3 are inert on any file not named `*.observer.ts`; the fourth is the importer gate and runs everywhere, because production importing observer machinery is the one violation an observer-only rule could never see.

## Quick Start

```ts
// oxlint.config.ts
import effectObserver from '@systemfsoftware/oxlint-plugin-effect-observer'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-observer'],
  rules: { ...effectObserver.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-observer/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                            | Reports                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observer-no-domain-imports`    | Any import, type import, or re-export whose path ends in a domain cell suffix (`.schema`, `.workflow`, `.executor`, `.store`, `.acl`, `.adapter`, `.handler`, `.middleware`, `.policy`, `.state`, `.shape`). Sibling `*.observer` modules, `*.kernel` helpers, and `effect/*` are permitted |
| `observer-operational-exports`  | An exported value, type, interface, or specifier whose name is not operational-shaped: verb- or token-led (`runSteps`, `makeHarness`, `StepHarness`) or an UPPER_SNAKE constant. `anOrder`, `OrderService`, `config` are reported                                                           |
| `observer-no-escaping-state`    | A module-level `let`/`var` binding, or a module-level `const` holding a mutable container (`new Map/Set/WeakMap/WeakSet`, an array literal, or an object literal). `Object.freeze(...)` and per-operation state pass                                                                        |
| `observer-no-production-import` | Any file that is not a test file, not an observer module, and not a tooling entrypoint importing a `*.observer.*` module — including `import type` and re-exports. Runs on every file, not just observer files                                                                              |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-observer'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Three rules are filename-gated: only `*.observer.ts` files are examined. The fourth only fires when a production file imports observer machinery — if nothing does, it stays quiet.

**Q: Diagnostics say `@systemfsoftware/effect-observer(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-observer/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
