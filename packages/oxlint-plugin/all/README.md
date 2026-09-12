# @systemfsoftware/all

Compatibility re-export of the canonical [oxlint](https://oxc.rs/docs/guide/usage/linter.html) preset for Effect-TS and the functional-core / imperative-shell architecture. The composition lives in [`@systemfsoftware/oxlint-preset`](../oxlint-preset/README.md); this package declares nothing of its own.

## Install

```sh
pnpm add -D @systemfsoftware/all effect oxlint oxlint-tsgolint typescript
```

`effect`, `oxlint`, `oxlint-tsgolint`, and `typescript` are peer dependencies so your project controls its own versions. `oxlint-tsgolint` is the type-aware evaluation engine required for semantic rules (e.g. boundary assertions and schema codecs).

## Quick Start

```ts
// oxlint.config.ts
import all from '@systemfsoftware/all'

export default all
```

> [!NOTE]
> Type-aware rules require a `tsconfig.json` covering the files being linted. Without type information, type-dependent rules are skipped.

## Exports

| Export           | Value                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `default`        | The canonical root preset, the same object `@systemfsoftware/oxlint-preset` exports as its default                  |
| `defaultIgnores` | The nine non-source globs (`**/dist/**`, `**/*.d.ts`, `**/*.tsbuildinfo`, …) a config spreads into `ignorePatterns` |

To compose your own root around the preset, extend it rather than spreading it — a spread replaces the preset's `overrides` instead of merging with them (`docs/solutions/build-errors/oxlint-preset-overrides-are-replaced-by-a-spread.md`):

```ts
// oxlint.config.ts
import all, { defaultIgnores } from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  ignorePatterns: [...defaultIgnores, 'generated/**'],
})
```

## Gate

`pnpm --filter @systemfsoftware/all test` asserts the module source declares no config and resolves no plugin specifier, that the built default and `defaultIgnores` deep-equal the canonical root's, and that the module namespace exposes exactly those two names.

## Contributing

Development setup and repo workflow: [AGENTS.md](../../../AGENTS.md).

## License

[Apache-2.0](LICENSE). Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).
