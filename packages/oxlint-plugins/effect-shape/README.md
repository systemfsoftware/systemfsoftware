# @systemfsoftware/oxlint-plugin-effect-shape

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-shape?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-shape)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-shape?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want `*.shape.ts` files that stay foreign-model declarations.

```
x @systemfsoftware/effect-shape(shape-no-domain-import): ./order.schema.js is forbidden.
  Expected: only the foreign system's own vocabulary — never a domain declaration.
  Actual: an import of a domain cell (schema, workflow, executor, store, acl, adapter, handler, middleware, policy, state, observer, or kernel).
  Fix: let the *.acl.ts cross the boundary — the shape declares only the foreign model.

x @systemfsoftware/effect-shape(shape-no-behaviour): scanRowToDomain is forbidden.
  Expected: inert declarations only — type aliases, interfaces, const declarations, foreign-owned enums.
  Actual: a function-valued const.
  Fix: move the behaviour to the *.acl.ts, *.workflow.ts, or the owning shell cell — a shape declares, it never computes.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-shape
```

## The Problem

A `*.shape.ts` declares another system's model — a DB row, a wire DTO, a webhook payload. Add a domain import, a helper function, or a second foreign package and it still compiles and still passes its tests. The corruption only shows up later, when the domain transitively depends on the storage model or the shape starts deciding things the ACL should own.

These three rules make that boundary executable. Every rule is inert on any file not named `*.shape.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectShape from '@systemfsoftware/oxlint-plugin-effect-shape'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-shape'],
  rules: { ...effectShape.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

## Rules

| Rule                         | Reports                                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape-no-anti-pattern-path` | A `*.shape.ts` file under a junk-drawer directory segment (`core`, `shell`, `util`, `utils`, `helper`, `manager`, `service`) — the path should name the bounded context the foreign model belongs to                                                                 |
| `shape-no-domain-import`     | An import (or `export * from` re-export) of a sibling `*.schema.ts` declaration or any other DMMF cell — the shape must import nothing domain                                                                                                                        |
| `shape-no-behaviour`         | A function declaration, a function-valued const, a class method body (including constructors), or a function default export — shapes hold only type/interface/const declarations and foreign-owned enums; interface method signatures are declaration, not behaviour |
| `shape-one-foreign-system`   | Package imports from two or more distinct package roots — a shape declares exactly one foreign system, so `drizzle-orm` and `@stripe/stripe-js` never share a file; relative and `node:` imports are not foreign systems                                             |

## Scope

Only the mechanically-enforceable fragment of the cell skill is linted here. The reverse direction (no non-shape file imports a foreign constructor) and the domain-package half of the no-domain-import gate stay review-gated — see the cell skill's SH1/SH2/SH5 and `AGENTS.md`.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-shape/AGENTS.md)

## License

[MIT](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
