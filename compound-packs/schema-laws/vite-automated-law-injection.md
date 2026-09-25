---
title: Automatically discover exported schemas and inject codec laws using effect-schema-vite
applies_when:
  - configuring vitest or vite plugins for a package exporting Effect Schemas
  - organizing schema law suites across workspace packages
  - eliminating manual boilerplate for schema property test registration
tags: [schema, vite, vitest, effect-schema-vite, test-generation, automation]
---

Manual registration of `ruleOfSchemas` across dozen of schema files invites drift: newly added or modified domain schemas easily escape property test coverage when test file authors forget to append test invocations.

### 1. Zero-Boilerplate Law Discovery via `inlineSchemaTests()`

Packages that author and export Effect Schemas should register `@systemfsoftware/effect-schema-vite` in their `vitest.config.ts`:

- The plugin scans exported schemas in `src/` (or a configured `dir`).
- It automatically generates and maintains `src/schema-laws.test.ts`.
- It imports every exported schema under an isolated alias to prevent collision and registers `ruleOfSchemas` and `recursionLaws` for each.
- It automatically hooks the `recursionBudget` AST derivation so recursive schema tests execute within bounded depth.

```ts
// WRONG: Manually maintaining individual law test files for each schema file
// src/__tests__/Order.laws.test.ts
// src/__tests__/User.laws.test.ts
// (Misses NewlyAddedEntity.schema.ts when someone forgets to create a test file)

// RIGHT: Central automated schema discovery in vitest.config.ts
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    inlineSchemaTests({
      dir: 'src',
    }),
  ],
})
```

### 2. The `schema-laws.test.ts` Contract

`LAW_FILE_BASENAME = 'schema-laws.test.ts'` is the designated whitelist path:

- It must be git-tracked or generated during the test lifecycle.
- It tests schemas via pure public exports without private accessors.
- It guarantees that any exported schema in `src/` immediately receives round-trip and encode-stability verification on every test run.

Gate: `pnpm --filter <pkg> test` exercising `src/schema-laws.test.ts`.
