# @systemfsoftware/oxlint-plugin-effect-entrypoint

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-entrypoint?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-entrypoint)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-entrypoint?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want `main.ts` to be an interpretation edge instead of a junk drawer.

```
x @systemfsoftware/effect-entrypoint(entrypoint-no-exports): a named export from main.ts is forbidden.
  Expected: an entrypoint with no public surface at all.
  Actual: an entrypoint exporting a binding for another module to import.
  Fix: nothing may import main.ts, so an export here is dead weight - move the binding to the cell
       that owns it (executor, adapter, layer) and leave main.ts holding only the interpretation edge.

x @systemfsoftware/effect-entrypoint(entrypoint-not-imported): ./main.js is forbidden.
  Expected: the entrypoint imported by nothing - the process interprets it, no module consumes it.
  Actual: an import of main.ts.
  Fix: import the cell that owns the binding instead; if main.ts is the only place it exists, it was
       never an entrypoint.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-entrypoint
```

## The Problem

An Effect value is a description; nothing happens until something interprets it. That interpretation should happen **once**, in one file, and `main.ts` is the conventional name for it.

The name is also the problem. Filename conventions that require a cell suffix (`*.executor.ts`, `*.adapter.ts`) exempt `main.ts`, because an entrypoint genuinely is not a cell. That exemption is a hole: park a supervision engine, a layer registry, and six helpers in `main.ts` and the file passes every architectural rule at once — not because it complies, but because nothing examines it. The tell is always the same: something imports it.

These five rules close the hole by constraining what `main.ts` may contain rather than what it may be called. An entrypoint interprets exactly once, exports nothing, is imported by nothing, and does not hand a foreign promise to `runMain` and call that an edge. The fifth rule judges a property that crosses module boundaries: the process runtime is built once, lazily, at module scope, so `ManagedRuntime.make` reached per call and a runtime constructed while the module is imported are both errors. A file that cannot satisfy the entrypoint rules was never an entrypoint, and naming it correctly becomes cheaper than hiding in the exemption.

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

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-entrypoint/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                             | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoint-interprets-once`     | A `main.ts` with no interpretation edge, or with more than one. Edges are `runMain` (under any namespace), `Effect.run*`, `ManagedRuntime.make`, and `Layer.toRuntime`                                                                                                                                                                                                                                                                                                                                                                                |
| `entrypoint-no-exports`          | Any `export` from `main.ts` — named, default, `export *`, re-export, or type-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `entrypoint-not-imported`        | Any static import, re-export, or dynamic `import()` of a `main` module, reported **in the importing file** — production, barrel, or test alike                                                                                                                                                                                                                                                                                                                                                                                                        |
| `entrypoint-no-promise-wrapper`  | `runMain(Effect.tryPromise(...))` / `runMain(Effect.promise(...))` in `main.ts` — the outer edge only awaits a promise while the real fibers run in a runtime it cannot interrupt                                                                                                                                                                                                                                                                                                                                                                     |
| `runtime-construction-placement` | `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` called inside a function body — wiring rebuilt per call — and `ManagedRuntime.make` evaluated at module scope. The module-scope lazy bootstrap is lawful only when the construction's result is written into a cache binding (a plain assignment, or a `??=` / `\|\|=` form), or into a declarator whose binding a nested closure captures: a closure that merely wraps the call hands back a fresh runtime on every call and reports. Every `cell.run(input)` arrow application is lawf... |

All five rules are in the recommended set, so the spread above enables them at `error`.

## FAQ

**Q: Installed, but nothing is reported.**
A: Three of the five rules are filename-gated to the exact basename `main.ts`. `entrypoint-not-imported` and `runtime-construction-placement` run on every file — the violation lives in the importer or in the constructing module; `cell.run(input)` at any depth, module-scope layer composition, module-scope composition in a module its package declared as an edge in the rule's `edges` option, and a clean file all report nothing, so that is the usual answer.

**Q: My app builds its runtime in a module-scope lazy thunk. Does `runtime-construction-placement` report it?**
A: No — that is the lawful shape: `const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))`, where the construction's result is written into a cache binding so every call reads the one runtime, as with `const ready = import('./runtime.js').then((m) => make(m.L))`. A closure that merely wraps the call, `const getRuntime = () => ManagedRuntime.make(AppLive)`, caches nothing and reports as wiring built per call; so does a runtime built inside any other function body, and `ManagedRuntime.make` evaluated at import time, where importing the module starts fibers no entrypoint can interrupt. The eager-construction verdict is exempt only where a package declares its own edge by exact basename in the rule's `edges` option — `global-setup.ts` in this repo's CLI is the working example — so module-scope composition there is the sanctioned shape; a runtime built inside a function body in a declared edge still reports.

**Q: Is a test file exempt from `runtime-construction-placement`?**
A: Not by virtue of being a test. A `.test.ts` file is runtime code — vitest executes it — so a runtime built per test is real wiring that leaks fibers, and the rule reports it. A `.tst.ts` type-test file is exempt: it runs nowhere and only asserts what the types refuse, so it constructs nothing to place.

**Q: `ManagedRuntime.make` plus many `runtime.runPromise` calls — is that two edges?**
A: No. `ManagedRuntime.make` is the edge; calling `runPromise` on the resulting runtime is using it. Only the construction counts.

**Q: My package is a library with no process entry. Where does the edge go?**
A: Nowhere — a library should not have a `main.ts` at all. Publish the cells (executor, adapter, layer) and let the consuming application own its entrypoint.

**Q: Why are test files not exempt from `entrypoint-not-imported`?**
A: A test importing `main.ts` proves the same thing a production import proves: behavior lives there that belongs in a cell. Exempting tests would let the junk drawer grow behind its own suite.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-entrypoint/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
