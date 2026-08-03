# @systemfsoftware/oxlint-plugin-effect-store

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-store?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-store)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-store?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want store files that stay persistence leaves.

```
x @systemfsoftware/effect-store(store-no-driver-construction): drizzle-orm/node-postgres is forbidden.
  Expected: no driver constructor or connection-config import — the store is technology-blind.
  Actual: an import of a driver package.
  Fix: delete the import and take the driver via the injected DB Context.Tag (yield* DB) — the adapter owns the driver.

x @systemfsoftware/effect-store(store-no-domain-branch): _tag is forbidden.
  Expected: data-integrity existence checks only — domain branches live in the workflow.
  Actual: a branch on a domain-typed _tag.
  Fix: move the branch into the *.workflow.ts — the store receives already-decided data and persists it.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-store
```

## The Problem

A `*.store.ts` is meant to be the persistence leaf: `Effect.fn` functions over one aggregate that read rows and decode them through the ACL, encode writes through the ACL, and take their driver from an injected `Context.Tag`. Add a `drizzle` import, a `new Pool()`, a `process.env.DATABASE_URL` read, an `if (order._tag === ...)` branch, or a module-level cache and it still compiles — the violation is only wrong relative to a convention no tool knows about.

These six rules make that convention executable. Every rule is inert on any file not named `*.store.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectStore from '@systemfsoftware/oxlint-plugin-effect-store'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-store'],
  rules: { ...effectStore.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-store/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                           | Reports                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store-acl-required`           | No value import from the aggregate's `*.acl.ts` — every row↔domain crossing must go through the ACL, never a cast                                                    |
| `store-effect-fn-required`     | An exported function not wrapped in `Effect.fn`, or an exported Effect value built with `Effect.gen`/`Effect.sync` instead of `Effect.fn`                            |
| `store-no-domain-branch`       | `Match.value` over an ACL-derived value, and `if`/ternary/`switch` branching on a domain-typed `_tag` — existence checks on branded optionals stay allowed           |
| `store-no-driver-construction` | An import of a driver package (`drizzle-orm`, `pg`, `better-sqlite3`, …), a `new Pool`/`Client`/`Database`, or a `process.env` read — the driver comes from the port |
| `store-no-escaping-state`      | A module-level `let`/`var` binding or a module-level `Map`/`Set`/`WeakMap`/`WeakSet` — a store is a stateless leaf                                                   |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-store'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.store.ts` files are examined.

**Q: Diagnostics say `@systemfsoftware/effect-store(...)`, but my config key is the full package name.**
A: Expected — oxlint shortens the namespace when printing. Both spellings work as config keys.

**Q: My store legitimately branches on an `Option`/`undefined` check and gets flagged.**
A: Existence checks never read `_tag`, so they pass. Only branches on a domain-typed `_tag` are reported — a store receives already-decided data and persists it; the branch belongs in the `*.workflow.ts`.

**Q: Why is `store-no-domain-branch` stricter than the executor's rule?**
A: An executor is allowed to dispatch over the decision a workflow _returned_ (translation). A store has no sanctioned `_tag` dispatch at all — STO4b's allowlist covers only null/existence checks.

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
