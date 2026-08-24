# @systemfsoftware/effect-schema-refutation-vite

Vite plugin that asserts every custom obligation and refinement reachable from an exported Effect `Schema` is tested for rejection.

## Install

```sh
pnpm add -D @systemfsoftware/effect-schema-refutation-vite @systemfsoftware/effect-schema-law effect vite vitest
```

## Usage

Add `inlineRefutationCoverage` to your Vitest configuration, typically alongside `@systemfsoftware/effect-schema-vite`:

```ts
import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
})
```

`inlineSchemaTests` generates `src/schema-laws.test.ts` for round-trip identity laws. `inlineRefutationCoverage` generates `src/schema-refutations.test.ts` to assert that every reachable refinement in exported schemas has a corresponding `refutes` check.

## API

The public surface is generated from source and tracked in [`etc/effect-schema-refutation-vite.api.md`](./etc/effect-schema-refutation-vite.api.md).

### Options

`InlineRefutationCoverageOptions`:

- `dir` (string, default `"src"`): Root source directory to scan for schema exports.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/refutation-vite#readme).
