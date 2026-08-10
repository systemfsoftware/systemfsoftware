# @systemfsoftware/oxlint-plugin-recommended

The recommended **stock** oxlint settings for the cell architecture: a
universal defect tier plus cell-scoped overrides, built entirely from rules
oxlint already ships. No custom rules, no plugin dependencies.

Every setting here is a built-in rule pointed at an invariant of the
architecture. The custom cell rules — workflow, executor, schema, taxonomy,
placement — live in their own plugins and compose with this preset; they are
not bundled into it.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-recommended
```

```ts
import recommended from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({ extends: [recommended] })
```

One `extends` entry delivers the whole preset. This replaces the five-key
spread this README used to teach — `plugins`, `options`, `categories`,
`rules`, and `overrides` written out by hand. Every one of those keys
propagates through `extends` (measured on oxlint 1.77.0), so the old failure
mode is structurally impossible: a consumer who forgot a spread key — most
often `options` or `plugins` — had the preset quietly enforce less than it
claims, with a type-aware rule producing no diagnostics at all and a rule
whose namespace is missing from `plugins` reported as unknown rather than
applied. Nothing is left to forget now.

No `jsPlugins` entry is needed: this package ships no rules of its own, only
settings over stock ones.

### Partial adoption

The fragments the preset is built from stay exported as named values, for a
consumer that wants only part of it:

```ts
import recommended, { options, overrides, plugins, rules } from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: [...plugins],
  options: { ...options },
  categories: { correctness: 'error' },
  rules: { ...rules },
  overrides: [...overrides],
})
```

### `ignorePatterns` does not propagate

`extends` propagates every key the preset carries — `plugins`, `options`,
`categories`, `rules`, `overrides` — but **not** `ignorePatterns`. It is the
one key oxlint leaves to each consumer (measured on oxlint 1.77.0): a
project with custom ignores must restate them in its own config; they will
not arrive through `extends`.

## What "honest" means here

Three tests. A rule ships only if it passes all three, and the one rule that
does not — `no-ternary` — is labelled where it appears rather than quietly
counted as derived (V.6: no silent bypass).

1. **It names an invariant.** Not a preference — a clause of the constitution
   or a law of the general theory, cited in the tier tables below. "The team
   agreed" is not an invariant.
2. **It cannot fire on correct code.** A rule that reports code obeying the
   invariant is not a gate; it is a tax that teaches the team to disable
   rules, and the disable habit is how the real gates die (L1).
3. **It is the only observer of its invariant.** If a custom cell rule already
   gates it, the built-in is not added here (V.7 — subtract before you add).

The consequence is that this preset is **narrow and glob-scoped**, not a
maximal category sweep. Turning on `style`, `restriction`, and `pedantic`
wholesale produces roughly 1750 findings on working code in this monorepo —
each one a lesson that the linter is wrong.

## The tiers

### Universal — defect classes, every file

| Rule                                                                                      | Invariant               | Why it cannot fire on correct code                                                                                    |
| ----------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `typescript/no-explicit-any`, `no-unsafe-{argument,assignment,call,member-access,return}` | II.5 decode, never cast | `any` flowing into typed positions is the laundering path the decode rule exists to close                             |
| `no-ternary`                                                                              | one branching form      | operator ruling, not a derivation — see below. A branch belongs in an `if`, where review and coverage can see it      |
| `typescript/consistent-type-assertions` (`assertionStyle: never`)                         | II.5 + G1 hardening     | an assertion changes the compiler's belief, never the value; brands widen back through `as`. `as const` is unaffected |
| `typescript/no-non-null-assertion`                                                        | I.5                     | `!` asserts away precisely the null the type is warning about                                                         |
| `typescript/ban-ts-comment`, `unicorn/no-abusive-eslint-disable`                          | L1 anti-gaming          | suppression is the one edit that removes an observer; `ts-expect-error` survives only with a description              |
| `typescript/no-floating-promises`, `no-misused-promises`, `await-thenable`                | II.2 effects are values | an unawaited effect is an effect nobody observes                                                                      |
| `typescript/only-throw-error`, `no-throw-literal`                                         | B8 three channels       | a thrown non-error carries no channel a consumer can branch on                                                        |
| `typescript/no-unnecessary-condition`, `no-unnecessary-type-assertion`                    | III.4 / B5              | a condition that cannot change the outcome is an equivalent-mutant factory                                            |
| `typescript/strict-boolean-expressions`                                                   | I.5                     | `if (x)` on `boolean \| undefined` reads identically for absent and false                                             |
| `typescript/switch-exhaustiveness-check`                                                  | G1 exhaustiveness       | the missing arm becomes an error — the one gate the red team could not break                                          |
| `typescript/no-base-to-string`                                                            | I.4                     | `[object Object]` is primitive obsession reaching the user                                                            |
| `typescript/explicit-module-boundary-types`                                               | II.1 / L6               | the module boundary is the contract; an inferred exported signature changes silently                                  |
| `import/no-cycle`                                                                         | II.4                    | a cycle means the dependency direction is violated somewhere in it                                                    |
| `import/no-mutable-exports`                                                               | S axis                  | an exported mutable binding is escaping state outside the quarantine cell                                             |
| `no-var`                                                                                  | scope defects           | cannot fire on modern code that never writes `var`                                                                    |

### Cell-scoped overrides — the two regimes

The core is one path; the shell is imperative (B4). A rule that binds one
regime fires on correct code in the other, so the regime rules are overrides
keyed on the cell suffix, never flat rules. Shell cells (`*.executor.ts`,
`*.store.ts`, `*.adapter.ts`, `*.state.ts`, `*.policy.ts`) appear in no tier
below — `if`, `for`, and `while` are legal there, and this preset says so by
saying nothing.

| Files                                                                     | Rules                                                                                                                                                   | Invariant                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `*.schema.ts`, `*.shape.ts`, `*.acl.ts`, `*.registry.ts`, `*.workflow.ts` | `no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports` (I/O modules, Effect runtime with `allowTypeImports`, adapter modules)     | I.1 — a pure cell has no clock, no randomness, no environment, no runtime, and never names a driver |
| `*.kernel.ts`                                                             | the same purity set, plus a ban on importing any domain or technology cell                                                                              | kernel is `G = domain-blind`; the Effect runtime stays legal (sanctioned kernel effect helpers)     |
| `*.middleware.ts`                                                         | no import of executor, workflow, or store                                                                                                               | atlas — the front-half attaches facts, never decisions                                              |
| `*.handler.ts`                                                            | no import of workflow or store                                                                                                                          | atlas — the terminus calls exactly one executor; reaching past it splits the sandwich               |
| `*.test.ts`, `tests/**`, `__tests__/**`                                   | `vitest/expect-expect`, `valid-expect`, `no-standalone-expect`, `no-conditional-in-test`, `no-focused-tests`, `no-disabled-tests`, `no-identical-title` | X5 — a test that asserts nothing passes; `.only` and `.skip` delete observers                       |

`no-ternary` is on everywhere, and it is the one rule here that ships as an
**operator ruling rather than a derivation**. Admission test 2 is not met: a
correct shell ternary now reports, and the fix is to write the `if`. The
theory's own G2 hardening bans ternaries in core cells; extending that
repo-wide is a project decision about having exactly one branching form, and
it is recorded as such rather than dressed up as an invariant.

Its consequence in the decision cell is real: `workflow-single-path` permits
one converging ternary — the transient CC=2 edge (B4) — and this rule removes
it. Since `if` is already banned there, `*.workflow.ts` becomes `Match`-only.
That is tighter than the theory requires, and coherent.

There is still **no** complexity rule for `*.workflow.ts`. No stock rule can
express "one guard, first statement, converging": `complexity: max 1` would
fire on a sanctioned guard and `max 2` would wave through an `if`.
`effect-workflow`'s `workflow-single-path` is where that gate lives.

The purity row does cover `*.workflow.ts`, which overlaps
`workflow-no-ambient-impurity` and `workflow-no-effect-import` for projects
that also register `effect-workflow`. That overlap is deliberate: a workflow
is a pure cell, and a preset that gates purity everywhere _except_ the
decision cell has a hole no reader would expect. Registering both packages
reports such a violation twice.

## The refusal ledger

Stock rules deliberately left off, each with what it would fight. A preset
without this list is a preference wearing a rule's clothes.

| Refused                                                                                  | Why                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `no-nested-ternary`                                                                      | redundant under `no-ternary`, which is enabled above                                                                                    |
| `complexity`, `max-depth`, `max-lines`, `max-statements`                                 | the shell sequences I/O and is allowed to; the decision cell's complexity is gated by its own rule                                      |
| `style`, `restriction`, `pedantic` categories wholesale                                  | ~1750 findings on correct code in this repo; rules that fire on correct code train the disable habit and cost the real gates (L1)       |
| `typescript/explicit-function-return-type`                                               | demands annotations on private functions, where the type is inferred and checked either way; the boundary variant carries the invariant |
| `curly`, `sort-keys`, `sort-imports`, `capitalized-comments`, `numeric-separators-style` | dprint owns formatting; none names an invariant                                                                                         |
| `import/group-exports`, `import/exports-last`                                            | export _topology_ is a real invariant; how you punctuate exports is not                                                                 |
| `unicorn/prefer-at`                                                                      | the fix is marked dangerous and lint-staged applies fixes unreviewed                                                                    |
| `eqeqeq`                                                                                 | in strict TypeScript the coercion it prevents is already a type error                                                                   |
| `vitest/prefer-expect-assertions`                                                        | fires on correct single-assertion tests; `expect-expect` closes the actual X5 exploit                                                   |

## Known residue

The theory demands these; no stock rule can deliver them. They are listed
rather than implied (L5 — a ruling that cannot compile to a gate is dated debt
or deleted, never silent prose).

| Ruling                                                                            | Where it is gated instead                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the cell contracts: workflow, executor, schema, filename taxonomy, test placement | the custom plugins — `effect-workflow`, `effect-executor`, `effect-schema`, `cell-taxonomy`, `test-placement`, `property-testing`, `test-hygiene`, and the core plugin. Register them alongside this preset |
| terminus calls **exactly one** executor                                           | the import ban here is a sound subset; the count is G11 review                                                                                                                                              |
| store owns the transaction primitive                                              | the driver is project-specific; supply a `no-restricted-imports` pattern per project                                                                                                                        |
| G7 mutation, G6 properties, G8 composition, G9 contract                           | other observers; lint cannot see them                                                                                                                                                                       |

## Development

`src/index.ts` is declaration data — literal rule bags and glob arrays, no
functions and no control flow, so there is no decision surface for a test
suite or mutation gate to earn its keep. `scripts/guard-no-behavior.mjs` is
wired into this package's `lint` script and fails the build if that stops
being true.

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-recommended build
```
