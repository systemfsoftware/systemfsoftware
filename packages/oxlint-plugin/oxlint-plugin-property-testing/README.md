# @systemfsoftware/oxlint-plugin-property-testing

![version](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-property-testing)
![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-property-testing)

> Enforce the property-testing contract: `it.prop` / `it.effect.prop` predicates return a boolean on every path, never call `expect`/`assert`, live only in `*.property.test.ts` files, and import FastCheck only from `effect`.

fast-check counts `undefined` as **success** — a bare `return;`, a non-boolean return, or falling off the end of a predicate is a silent pass wearing a green checkmark. These rules make the silent failure modes loud.

## Rules

| Rule                       | What it enforces                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-silent-return`         | Every code path of an `it.prop` / `it.effect.prop` predicate (including `Effect.gen` generator bodies) ends in `return <boolean>`. Flags bare `return;`, missing returns, and provably non-boolean returns.                                                                                                                                                                                     |
| `no-assert-in-property`    | No `expect(...)`, `assert*(...)`, or raw `fc.assert`/`fc.check` inside a property predicate. The boolean return IS the verdict. `assert*` stays correct in normal tests.                                                                                                                                                                                                                        |
| `property-file-purity`     | Property tests live ONLY in `*.property.test.ts` files (no plain `it()`/`it.effect()` or raw `fc.assert` there), and every other test file contains no FastCheck imports and no `it.prop` / `it.effect.prop` calls. The two never mix.                                                                                                                                                          |
| `require-effect-fastcheck` | FastCheck is imported as `import { FastCheck as fc } from 'effect'` — never from the `fast-check` package, never under another alias (type-only imports exempt).                                                                                                                                                                                                                                |
| `no-unbounded-fanout`      | A collection arbitrary (`S.Array`, `S.Record`, `fc.array`) with no numeric `maxLength`/`maxKeys` that reaches a property generator through an exported recipe (a builder invocation such as `boundedUnion(...)`) is unbounded fan-out — a `maxDepth` cap bounds depth only. Bounded collections and files listed in the `exempt` option (basenames) stay silent.                                |
| `no-nested-quantification` | A property predicate must not quantify over its own generated value and call out again inside that loop — per-case cost then scales with the drawn size rather than the draw count, and a budget tuned on small draws times out on large ones. Iteration over a bound the generator does not control, and a fold whose body calls nothing, stay silent, as do basenames in the `exempt` option. |

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-property-testing
```

```ts
// oxlint.config.ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-property-testing'],
  rules: {
    '@systemfsoftware/oxlint-plugin-property-testing/no-silent-return': 'error',
    '@systemfsoftware/oxlint-plugin-property-testing/no-assert-in-property': 'error',
    '@systemfsoftware/oxlint-plugin-property-testing/property-file-purity': 'error',
    '@systemfsoftware/oxlint-plugin-property-testing/require-effect-fastcheck': 'error',
    '@systemfsoftware/oxlint-plugin-property-testing/no-unbounded-fanout': 'error',
    '@systemfsoftware/oxlint-plugin-property-testing/no-nested-quantification': 'error',
  },
})
```

Or spread the recommended preset:

```ts
import propertyTestingPlugin from '@systemfsoftware/oxlint-plugin-property-testing'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-property-testing'],
  rules: {
    ...propertyTestingPlugin.configs.recommended.rules,
  },
})
```
