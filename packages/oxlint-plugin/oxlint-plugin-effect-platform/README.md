# @systemfsoftware/oxlint-plugin-effect-platform

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-platform?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-platform)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-platform?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> Oxlint rules enforcing Effect Platform runtime entrypoint semantics, I/O boundaries, and native global bans.

## The end state

A compliant process entry is small enough to read in one glance:

```ts
// main.ts
import { runMain } from 'effect'
import { program } from './src/Program.js'

runMain(program)
```

Every behavior lives in the cell that owns it — executor, adapter, layer — because an entrypoint that holds behavior is a junk drawer that passes every architectural rule at once: nothing examines it, and the tell is always that something imports it.

Wiring is declared once, in a module the package names as its edge, and read everywhere else:

```ts
// src/AppRuntime.ts — runtime code, so the placement rule watches it
import { ManagedRuntime } from 'effect'

let runtime: ManagedRuntime.ManagedRuntime<AppLive, never> | undefined

export const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))
```

And `cell.run(input)` is work, not wiring: an arrow application any module may perform at any depth. The six rules below keep those three facts mechanical, so a file that violates them fails lint instead of review.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-entrypoint
```

## Quick Start

```ts
// oxlint.config.ts
import effectEntrypoint from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-entrypoint'],
  rules: { ...effectEntrypoint.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

All six rules are in the recommended set, so the spread enables them at `error`. To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-entrypoint/<rule>': 'warn'`; entries placed after the spread override it.

## Rules

| Rule                             | Reports                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint-interprets-once`     | A `main.ts` with zero or more than one interpretation edge — `runMain` under any namespace, `Effect.run*`, `ManagedRuntime.make`, `Layer.toRuntime`                                                                                                                                                                                                              |
| `entrypoint-no-exports`          | Any export from `main.ts`: named, default, `export *`, re-export, or type-only                                                                                                                                                                                                                                                                                   |
| `entrypoint-not-imported`        | Any static import, re-export, or dynamic `import()` of a `main` module, reported in the importing file — production, barrel, or test                                                                                                                                                                                                                             |
| `entrypoint-no-promise-wrapper`  | `runMain(Effect.tryPromise(...))` or `runMain(Effect.promise(...))`: the outer edge awaits a promise while the real fibers run in a runtime it cannot interrupt                                                                                                                                                                                                  |
| `runtime-construction-placement` | `ManagedRuntime.make` or `Layer.provide` inside a function body — wiring rebuilt per call — and `ManagedRuntime.make` at module scope, where importing the module starts fibers nothing can interrupt. It judges runtime code: a file under a `src/` directory segment, or a `*.test.ts` file; a package-root hook, config, or setup file is outside its subject |
| `no-unported-time-source`        | A direct `Date.now`, `performance.now`, `process.hrtime`, `Math.random`, `crypto.getRandomValues`, `crypto.randomUUID`, `setTimeout`, `setInterval`, or `setImmediate` call, an argument-less `new Date()`, or a static or dynamic import of `node:timers` in production source outside a file listed in the rule's `ports` option                               |

What the placement rule leaves alone, each a shape the rule's own fixtures pin:

- A module-scope closure that memoizes the construction — written into a cache binding (`??=`, `||=`, plain assignment) or into a declarator whose binding a nested closure captures.
- Module-scope layer composition: `Layer.provide` at module scope builds a graph, not a runtime. `Cell.provideContext(context)` is silent everywhere — binding a context built once constructs no runtime.
- `cell.run(input)` at any depth, in any file.
- `main.ts`, the interpretation edge: exempt from the module-scope verdict, because the process entry is where building the runtime is the point. Wiring built inside one of its functions still reports.
- A package-root hook, config, or setup file: outside the rule's subject by location, which is why a test runner's hook module may compose at module scope.
- `.tst.ts` type-test files: they run nowhere, so they construct nothing to place.

Callers resolve through their import specifier — aliased, namespaced, or destructured from `await import('effect')`. A call reached through a re-export chain is not seen: the receiver must resolve to a direct import in the same file.

What the time-source rule leaves alone, each a shape the rule's own fixtures pin:

- `queueMicrotask(...)`: it yields to the microtask queue and reads no clock, so it is not a time source.
- `new Date(0)` and any `new Date(arg)`: the argument fixes the instant, so there is nothing for a clock port to own.
- A source injected as a parameter, shadowed by a local declaration, or imported from another module: the call crosses the boundary instead of reading the process, so the port — not the call site — owns the verdict.
- A file listed in the rule's `ports` option, matched by repo-relative path or path suffix: the recommended config registers `packages/atom/effect-atom/src/internal/HostTimer.ts` and `packages/schema/effect-schema-law/src/recursion-laws.ts`.
- Test and fixture files (`.test.ts`, `.spec.ts`, `__tests__/`, `__fixtures__/`, `tests/`, `testResources/`): the regime binds production code.

## FAQ

**Q: Installed, but nothing is reported.**
A: Three of the entrypoint rules are filename-gated to the exact basename `main.ts`. The rest judge production code, and a clean file reports nothing: `cell.run(input)` at any depth, module-scope layer composition, module-scope composition in a package-root hook, a memoized bootstrap, a timer reached through a port, and `queueMicrotask` are all outside the rules' verdicts.

**Q: Does `runtime-construction-placement` report my module-scope lazy thunk?**
A: No, when the thunk memoizes: `const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))` writes the construction into a cache binding, so every call reads the one runtime. A closure that merely wraps the call — `const getRuntime = () => ManagedRuntime.make(AppLive)` — caches nothing and reports as wiring built per call, as does a runtime built inside any other function body or evaluated at import time.

**Q: Is a test file exempt from `runtime-construction-placement`?**
A: Not by virtue of being a test. Vitest executes a `.test.ts`, so a runtime built per test is real wiring that leaks fibers, and the rule reports it. A `.tst.ts` type-test file is exempt: it runs nowhere and only asserts what the types refuse.

**Q: `ManagedRuntime.make` plus many `runtime.runPromise` calls — is that two edges?**
A: No. The construction is the edge; calling `runPromise` on the resulting runtime is using it.

**Q: My package is a library with no process entry. Where does the edge go?**
A: Nowhere — a library should not have a `main.ts` at all. Publish the cells and let the consuming application own its entrypoint.

**Q: Why are test files not exempt from `entrypoint-not-imported`?**
A: A test importing `main.ts` proves what a production import proves: behavior lives there that belongs in a cell. Exempting tests would let the junk drawer grow behind its own suite.

**Q: A construction reached through a re-export chain is not reported. Why?**
A: The rule reads syntax only, so a receiver must resolve to a direct import in the same file. Import the constructing module directly, or the construction stays invisible to this rule.

**Q: Why does `no-unported-time-source` report `setTimeout` but not `queueMicrotask`?**
A: `queueMicrotask` only yields to the microtask queue — it reads no clock, so no kernel port can or must own it. `setTimeout` reads the process schedule, so it reports unless the file is a registered port.

**Q: My function takes `setTimeout` as a parameter. Is that still unported?**
A: No. A timer injected as a parameter crosses the port boundary at the call site; the rule stays silent wherever the name resolves to a parameter, a local declaration, or an import. Only a reference that resolves to nothing — the process global — reports.

## Requirements

`effect` and TypeScript 5.0+ as peers. The rules read syntax only; no type information or `tsconfig` wiring is needed.

## Contributing

Issues and pull requests: [github.com/systemfsoftware/systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/issues).

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
