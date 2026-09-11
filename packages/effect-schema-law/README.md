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

## Recursive schemas

`recursionLaws(label, schema)` adds the generation laws a recursive union needs, and registers nothing at all for a schema whose syntax tree carries no recursion cycle. Pass the schema that _is_ the recursion point — the `Schema.suspend` that returns the union, or the union itself:

- **Nesting inside the declared ceiling** — every generated value stays within the budget the schema declares (a schema that declares none is held to the fixed per-suspension ceiling).
- **Deep values stay reachable** — a sample of generated values keeps a floor of deeply nested values. Registered only when the declaration asks for more depth than the stock derivation reaches, so it is never a claim that cannot be made.
- **Every member stays inhabited** — each member of the cycle is reachable from generation.

```ts
import { recursionLaws } from '@systemfsoftware/effect-schema-law'

// beside ruleOfSchemas — registers two more property tests for a recursive union
recursionLaws('Expr', Expr)
```

A `recursionBudget` annotation that nothing materialized — the plugin that builds the derivation hook is missing from the test run — fails the suite by name rather than quietly generating stock values.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-law
```

Install as a **devDependency** — the entry registers tests. `effect`, `vitest`, and `@effect/vitest` are peer dependencies: you bring your own (you already have them to run your tests), so the helper shares your single test-runner instance.

Call `ruleOfSchemas(name, schema)` at the top level of a Vitest test file, or inside an `if (import.meta.vitest !== void 0)` block in the module that declares the schema — a bundler that defines `import.meta.vitest` as `undefined` compiles that branch away, so nothing reaches your published output.
