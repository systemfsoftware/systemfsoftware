# @systemfsoftware/oxlint-plugin-effect-observer

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-observer?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-observer)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-observer?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want observer machinery that stays on the test side of the frame.

```
x @systemfsoftware/effect-observer(observer-operational-exports): step-harness.observer.ts is forbidden.
  Expected: an exported name in operational vocabulary (Step, Effect, Span, Fixture, Harness, run*, make*, …) or an UPPER_SNAKE constant.
  Actual: an exported name 'anOrder'.
  Fix: rename it verb- or token-led (e.g. makeHarness, runSteps); a domain-shaped name does not belong in observer machinery.

x @systemfsoftware/effect-observer(observer-no-escaping-state): step-harness.observer.ts is forbidden.
  Expected: state built fresh per operation.
  Actual: a module-level const holding a mutable Map.
  Fix: build it inside the operation, or wrap it in Object.freeze if it is genuinely static data.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-observer
```

## The Problem

A `*.observer.ts` file is the machinery observers run on — step harnesses, fixture builders, span recorders, test tooling. It reasons in operational vocabulary (Step, Effect, Span, Layer, Fixture), never domain nouns. Add a module-level registry or a non-operational export name and it still compiles, still passes a standard lint config, and still passes its tests. The violation is only wrong relative to a convention no tool knows about, and it surfaces months later as a test suite that is order-dependent.

These two rules make that convention executable. Both are inert on any file not named `*.observer.ts`.

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

| Rule                           | Reports                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observer-operational-exports` | An exported value, type, interface, or specifier whose name is not operational-shaped: verb- or token-led (`runSteps`, `makeHarness`, `StepHarness`) or an UPPER_SNAKE constant. `anOrder`, `OrderService`, `config` are reported |
| `observer-no-escaping-state`   | A module-level `let`/`var` binding, or a module-level `const` holding a mutable container (`new Map/Set/WeakMap/WeakSet`, an array literal, or an object literal). `Object.freeze(...)` and per-operation state pass              |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-observer'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Both rules are filename-gated: only `*.observer.ts` files are examined. If a file breaks neither gate, it stays quiet.

**Q: Diagnostics say `@systemfsoftware/effect-observer(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-observer/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
