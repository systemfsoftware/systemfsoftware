# @systemfsoftware/oxlint-plugin-recommended

The recommended **stock** oxlint settings for the cell architecture: a
universal defect tier plus a test-file hygiene tier, built entirely from rules
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

## What's Included

The preset defines two configuration tiers:

### Universal Defect Tier

Defect-class stock rules enabled at `error` across all files:

- **Type Safety & Assertions**: Disallows `any`, unsafe expressions/assignments/returns, and arbitrary type assertions (`typescript/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`, `typescript/no-non-null-assertion`).
- **Async & Effect Safety**: Catches unhandled or misused promises (`typescript/no-floating-promises`, `typescript/no-misused-promises`, `typescript/await-thenable`).
- **Control Flow & Error Handling**: Exhaustive pattern matches (`typescript/switch-exhaustiveness-check`), strict boolean checks (`typescript/strict-boolean-expressions`), and typed error throwing (`typescript/only-throw-error`, `no-throw-literal`).
- **Module & Boundary Invariants**: Prevents import cycles (`import/no-cycle`) and mutable exports (`import/no-mutable-exports`).

### Test Hygiene Tier

Enforces test assertion integrity and structure across `*.test.ts`, `tests/**`, and `__tests__/**` using stock `vitest` rules:

- Requires explicit assertions (`vitest/expect-expect`, `vitest/valid-expect`, `vitest/no-standalone-expect`).
- Forbids disabled, focused, or conditional tests (`vitest/no-disabled-tests`, `vitest/no-focused-tests`, `vitest/no-conditional-in-test`, `vitest/no-identical-title`).

## Development

`src/index.ts` is declaration data — literal rule bags and glob arrays, no
functions and no control flow, so there is no decision surface for a test
suite or mutation gate to earn its keep. `scripts/guard-no-behavior.mjs` is
wired into this package's `lint` script and fails the build if that stops
being true.

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-recommended build
```

## License

[Apache-2.0](LICENSE). Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).
