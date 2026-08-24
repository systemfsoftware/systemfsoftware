# @systemfsoftware/effect-schema-law

Two entries for testing [Effect](https://effect.website) `Schema` — codec laws and refusal adequacy — in one package.

- `.` → `ruleOfSchemas` — the codec laws every well-formed schema must obey.
- `./refutation` → `refutes`, `scanObligations`, `obligationsOf`, `adequacyReport`, and the weakening/obligation types — the refusal half the generated laws cannot reach.

`@systemfsoftware/effect-schema-bounded-union` stays separate: it peers on `effect` alone, while this package peers on `effect`, `vitest`, and `@effect/vitest`.

## `.` — codec laws

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

## `./refutation` — refusal and adequacy

A schema's generated laws draw inputs from the schema itself, so they cover what it accepts and nothing it refuses. `refutes` covers the other half:

```ts
import { refutes } from '@systemfsoftware/effect-schema-law/refutation'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const Hex = S.String.pipe(S.check(S.isPattern(/^[0-9a-f]*$/)), S.annotate({ identifier: 'Hex' }))

// inside a Vitest file
refutes(Hex, { NonHex: fc.stringMatching(/^[^0-9a-f]$/) })
```

One call registers three property kinds:

- **Refusal** — every value the named generator draws is rejected.
- **Discrimination** — every drawn value is rejected _for a reason the schema actually states_.
- **Adequacy** — every constraint the schema carries is defended by at least one generator.

Delete one constraint from a schema and you get a strictly more permissive schema. If some value is accepted by that weakened schema and rejected by the real one, that value is a **witness**: proof the constraint does real work. `refutes` enumerates weakenings, searches for a witness for each, and checks that a declared generator draws something the constraint refuses. A constraint nobody refuses is reported by name, with the path and witness.

```ts
import { adequacyReport, obligationsOf, scanObligations } from '@systemfsoftware/effect-schema-law/refutation'

obligationsOf(Hex) // Map keyed by the AST node each weakening removes
scanObligations(Hex) // plus blind arms no generator could draw for
adequacyReport(Hex, generators) // { adequate, undischarged, message }
```

Obligations are keyed by AST node, not by path. Three schemas built on one refinement owe **one** refusal between them — a generator that discharges that node discharges it everywhere.

A generator must be derived from what the type _promises about its values_, never read back off the refinement literal. Building the generator by negating the schema's own regex reproduces the circularity that makes generated laws blind.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-law
```

Install as a **devDependency** — both entries register tests. `effect`, `vitest`, and `@effect/vitest` are peer dependencies: you bring your own (you already have them to run your tests), so the helper shares your single test-runner instance.

Call `ruleOfSchemas(name, schema)` or `refutes(schema, generators)` at the top level of a Vitest test file, or inside an `if (import.meta.vitest !== void 0)` block in the module that declares the schema — a bundler that defines `import.meta.vitest` as `undefined` compiles that branch away, so nothing reaches your published output.

`@systemfsoftware/effect-schema-law` is the only import for laws. `@systemfsoftware/effect-schema-law/refutation` is the only import for the refusal surface. No other path in the package resolves.
