# @systemfsoftware/effect-schema-law

Codec-law property tests for [Effect](https://effect.website) `Schema`, in one call.

A schema is a two-way codec. `ruleOfSchemas` asserts the two laws every well-formed codec must obey, generating its inputs from the schema itself (via `@effect/vitest`'s `it.prop` + fast-check):

- **Round-trip identity** — `decode(encode(x))` equals `x` (by the schema's type equivalence).
- **Encode stability** — re-encoding the decoded value reproduces the original encoded form (by the encoded-side equivalence).

```ts
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import { Schema as S } from 'effect'

const Email = S.String.pipe(S.brand('Email'))

// inside a Vitest file — registers two property tests
ruleOfSchemas('Email', Email)
```

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-law
```

Install it as a **devDependency** — it's a test helper. `effect`, `vitest`, and `@effect/vitest` are peer dependencies: you bring your own (you already have them to run your tests), so the helper shares your single test-runner instance. Call `ruleOfSchemas(name, schema)` at the top level of a Vitest test file; it registers the two `it.prop` cases for you.
