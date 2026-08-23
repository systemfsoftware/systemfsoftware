# @systemfsoftware/effect-schema-refutation

State what an [Effect](https://effect.website) `Schema` **rejects**, and find out whether you have missed something.

A schema's generated laws draw their inputs from the schema itself, so they cover everything it accepts and nothing it refuses. `refutes` covers the other half:

```ts
import { refutes } from '@systemfsoftware/effect-schema-refutation'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const Hex = S.String.pipe(S.check(S.isPattern(/^[0-9a-f]*$/)), S.annotate({ identifier: 'Hex' }))

// inside a Vitest file
refutes(Hex, { NonHex: fc.stringMatching(/^[^0-9a-f]$/) })
```

That one call registers three kinds of property:

- **Refusal** — every value the named generator draws is rejected.
- **Discrimination** — every drawn value is rejected _for a reason the schema actually states_, not by accident.
- **Adequacy** — every constraint the schema carries is defended by at least one of your generators.

## Why adequacy is the interesting one

Delete one constraint from a schema — a refinement's predicate, or one side of a transformation — and you get a strictly more permissive schema. If some value is accepted by that weakened schema and rejected by the real one, that value is a **witness**: proof the constraint does real work, and proof that some test had better be refusing it.

`refutes` enumerates those weakenings, searches for a witness for each, and then checks that one of your declared generators draws something the corresponding constraint refuses. A constraint nobody refuses is reported by name, with the path that reaches it and the witness that got through — so a failure tells you which illegal value your schema is currently letting past its tests.

```ts
import { adequacyReport, obligationsOf, scanObligations } from '@systemfsoftware/effect-schema-refutation'

obligationsOf(Hex) // Map keyed by the AST node each weakening removes
scanObligations(Hex) // the same, plus the arms no generator could even draw for
adequacyReport(Hex, generators) // { adequate, undischarged, message }
```

Obligations are keyed by AST node, not by path. Effect shares nodes across composed schemas, so three schemas built on one refinement owe **one** refusal between them — and a generator that discharges that node discharges it everywhere it appears, whichever file declared it.

## Install

```bash
pnpm add -D @systemfsoftware/effect-schema-refutation
```

Install it as a **devDependency** — it registers tests. `effect`, `vitest` and `@effect/vitest` are peer dependencies: you bring your own, so the helper shares your single test-runner instance.

Call `refutes(schema, generators)` at the top level of a Vitest test file, or inside an `if (import.meta.vitest !== void 0)` block in the module that declares the schema — a bundler that defines `import.meta.vitest` as `undefined` compiles that branch away, so nothing reaches your published output.

## Writing generators that mean something

A generator must be derived from what the type _promises about its values_, never read back off the refinement literal. `fc.stringMatching(/^[^0-9a-f]$/)` says "a non-hex character is not a hex string", which is a claim about the domain. Building the generator by negating the schema's own regex reproduces the same circularity that makes generated laws blind, and it will pass while proving nothing.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/refutation#readme).
