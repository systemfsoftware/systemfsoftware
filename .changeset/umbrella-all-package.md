---
'@systemfsoftware/all': minor
---

New package: the whole stack in one install, plus a ready-made oxlint configuration.

Installing it brings in every published `@systemfsoftware/*` package at versions known to
work together, and its default export is an oxlint config that turns on the built-in
`correctness` category and every rule this architecture recommends — the workflow, schema,
test-placement, property-testing, hygiene, entrypoint and cell-vocabulary tiers — each at
`error`:

```ts
// oxlint.config.ts
import all from '@systemfsoftware/all'

export default all
```

`effect`, `oxlint`, `oxlint-tsgolint` and `typescript` are required peers, so your project
keeps one copy of each. `oxlint-tsgolint` is the engine the type-aware rules run on: without
it, the first lint run stops at "Failed to find tsgolint executable". Framework-specific
peers — React, Vitest, Vite, Storybook and the rest — are optional, and nothing warns about
the ones you skip.

The rules are type-aware, so the files you lint must be covered by a `tsconfig.json`.
Without one, roughly half of them produce no diagnostics while still reading as enabled.

`rules`, `plugins` and `ignorePatterns` are also exported by name, for composing instead of
extending. Every package remains published on its own; reach for this one when you want the
set rather than one library
