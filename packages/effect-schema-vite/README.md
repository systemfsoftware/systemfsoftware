# @systemfsoftware/effect-schema-vite

Vite plugin that automatically discovers exported Effect `Schema` declarations and injects codec law and generation law property tests using `@systemfsoftware/effect-schema-law`.

## Install

```sh
pnpm add -D @systemfsoftware/effect-schema-vite @systemfsoftware/effect-schema-law effect vite vitest
```

## Usage

Add the plugin to your `vitest.config.ts`:

```ts
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests()],
})
```

The plugin scans exported schemas in `src/` (configurable via `dir`) and writes a generated `src/schema-laws.test.ts` suite asserting round-trip identity and encode stability, plus the generation laws of every recursive schema: its generated nesting stays inside the ceiling the schema declares, deep values stay reachable, and every member of the cycle stays inhabited.

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-schema-vite.api.md`](./etc/effect-schema-vite.api.md).

### Options

`InlineSchemaTestsOptions`:

- `dir` (string, default `"src"`): Root source directory to scan for schema exports.

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-schema-vite#readme).
