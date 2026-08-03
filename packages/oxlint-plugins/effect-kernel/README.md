# @systemfsoftware/oxlint-plugin-effect-kernel

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-kernel?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-kernel)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-kernel?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want kernel files that stay pure, vocabulary-free behavior.

```
x @systemfsoftware/effect-kernel(kernel-no-ambient-impurity): fold.kernel.ts is forbidden.
  Expected: pure total computation with no ambient I/O, time, randomness, or environment access.
  Actual: Date.now().
  Fix: inject the value as a function argument or perform the side effect in an executor/adapter.

Found 0 warnings and 1 error.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-kernel
```

## The Problem

A `*.kernel.ts` is meant to be pure, domain-blind behavior: DSL combinators and generic utilities that any capability can reuse. Add a `Date.now()`, a `throw`, an `Effect.runSync`, an import of a `.workflow` file, or a junk-drawer name like `utils.kernel.ts` and it still compiles and still passes a standard lint config. The impurity only breaks the convention — until a consumer discovers the "generic" helper reads the clock.

These four rules make that convention executable. Every rule is inert on any file not named `*.kernel.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectKernel from '@systemfsoftware/oxlint-plugin-effect-kernel'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-kernel'],
  rules: { ...effectKernel.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-kernel/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                         | Reports                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel-no-throw`            | Any `throw` — a kernel is total; failures must be returned as data                                                                                                                                                                                                                                                                     |
| `kernel-no-ambient-impurity` | `Date.now`, `new Date`, `Date.parse`, `Date.UTC`, `performance.now`, `Math.random`, `crypto.randomUUID` at any depth, those members destructured, plus `process.env`, `console.*`, `fetch`                                                                                                                                             |
| `kernel-no-effect-runtime`   | A call that RUNS an Effect: `Effect.runSync`, `Effect.runPromise`, `Effect.runFork`, `Effect.runCallback`, `Effect.runSyncExit`, `Effect.runPromiseExit`, `Run.run`, `Run.runSync`, `Runtime.runSync`, `Runtime.runPromise`, `Runtime.runFork`. Constructing a description (`Effect.gen`, `Effect.sync`, `pipe`) stays pure and passes |
| `kernel-no-junk-drawer-name` | A `*.kernel.ts` file whose base name or any path segment is `util`, `utils`, `helper`, `common`, `shared`, `lib`, `core`, or `shell`                                                                                                                                                                                                   |

## FAQ

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.kernel.ts` files are examined.

**Q: Why is `import { Effect } from 'effect'` allowed?**
A: Building an Effect description is pure — the kernel cell may import language/library primitives. Only _running_ an effect is banned (`kernel-no-effect-runtime`).

**Q: Why is `kernel-no-junk-drawer-name` a rule?**
A: `utils.kernel.ts` is the junk drawer wearing the suffix. KE6 of the kernel cell requires the file name to describe the generic behavior it provides.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-kernel/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
