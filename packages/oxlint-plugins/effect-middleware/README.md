# @systemfsoftware/oxlint-plugin-effect-middleware

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-middleware?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-middleware)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-middleware?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want middleware files that stay at the transport edge.

```
x @systemfsoftware/effect-middleware(middleware-no-operation-imports): ./order.store is forbidden.
  Expected: imports of adapters, ports, schemas, and ACLs only — never the operation.
  Actual: an import of the .store cell.
  Fix: a middleware is the transport front-half — let the handler wire the executor and import only the port the middleware calls.

x @systemfsoftware/effect-middleware(middleware-gate-fails-on-decode-failure): Effect.succeed(null) is forbidden.
  Expected: a decode-failure branch that produces Effect.fail — the gate short-circuits at the edge.
  Actual: a decode-failure branch that succeeds with an Option or nullable.
  Fix: return Effect.fail with the typed 401/403/400 error so downstream handlers never see the invalid state.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-middleware
```

## The Problem

A `*.middleware.ts` is the shared transport front-half: it decodes a credential, cursor, or header into a branded fact and attaches it, or gates at the edge with a 401/403/400. Two failure modes compile, pass a standard lint config, and still pass their tests: the middleware quietly imports the operation (an executor, workflow, or store), turning itself into a mislabeled handler; and a decode-failure branch succeeds with `Effect.succeed(Option | nullable)` instead of failing, forcing every downstream handler to re-check the invalid state.

These two rules make that convention executable. Every rule is inert on any file not named `*.middleware.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectMiddleware from '@systemfsoftware/oxlint-plugin-effect-middleware'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-middleware'],
  rules: { ...effectMiddleware.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-middleware/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                                      | Reports                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware-no-operation-imports`         | An import of a `.executor`, `.workflow`, or `.store` sibling, or an import binding named `*Executor`/`*Workflow`/`*Store` — the middleware is the front-half and must never reach into the operation (architect-middleware MW2) |
| `middleware-gate-fails-on-decode-failure` | A decode-failure branch (an `if` on `!x`, `x == null`, `x === undefined`, `typeof x === 'undefined'`, or `Option.isNone(x)`) that produces `Effect.succeed(null                                                                 |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-middleware'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.middleware.ts` files are examined.

**Q: I import `effect/Effect` in my middleware and it passes. Is that right?**
A: Yes — middleware is impure transport behavior and may run effects at the edge. The operation-import ban covers sibling cell modules and operation bindings, not the Effect runtime.

**Q: Why does `Effect.succeed(Option.some(x))` in a failure branch fire?**
A: The success channel is still `Option<T>`, so every handler behind the gate must re-check for `None` — the exact deferred-gate harm MW3 exists to close.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-middleware/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
