---
level: error
tags: [conventions, tsconfig]
---

# tsconfig.json must reference its node project

Every first-party `tsconfig.json` declares `references: [{ "path": "./tsconfig.node.json" }]`
so the sibling node project typechecks the package's config scripts (`oxlint.config.ts`,
`tsdown.config.ts`, `vitest.config.ts`). Without the reference the config scripts are
typechecked by nothing — the correlation holds across the tree and nothing re-fires when
it is dropped. Exemplar: `packages/rx-effect/tsconfig.node.json`.

```grit
engine marzano(0.1)
language json

`$program` where {
  $program <: not contains `{ "path": "./tsconfig.node.json" }`,
  $program <: not contains `{ "path": "tsconfig.node.json" }`
}
```
