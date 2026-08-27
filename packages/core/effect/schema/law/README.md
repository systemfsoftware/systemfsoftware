# @systemfsoftware/effect-schema-law

Property-test codec laws for [Effect](https://effect.website) `Schema`.

A schema is a two-way codec. `ruleOfSchemas` asserts the two laws, generating inputs from the schema itself (via `@effect/vitest`'s `it.prop` + fast-check):

- **Round-trip identity** — `decode(encode(x))` equals `x`.
- **Encode stability** — re-encoding the decoded value reproduces the original encoded form.

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

Install as a **devDependency** — the entry registers tests. `effect`, `vitest`, and `@effect/vitest` are peer dependencies: you bring your own (you already have them to run your tests), so the helper shares your single test-runner instance.

Call `ruleOfSchemas(name, schema)` at the top level of a Vitest test file, or inside an `if (import.meta.vitest !== void 0)` block in the module that declares the schema — a bundler that defines `import.meta.vitest` as `undefined` compiles that branch away, so nothing reaches your published output.
