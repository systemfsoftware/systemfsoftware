# @systemfsoftware/oxlint-plugin-effect-dmmf

A combined oxlint plugin bundling the DMMF operation trio under one
entrypoint: the pure decision (`@systemfsoftware/oxlint-plugin-effect-workflow`),
the operation shell (`@systemfsoftware/oxlint-plugin-effect-executor`), and
their property-test verification altitude
(`@systemfsoftware/oxlint-plugin-property-testing`). Install one package,
register one `jsPlugin`, get all three rule sets.

This plugin defines no rules of its own. It re-exports the three sources'
rules under one plugin name and composes `configs.recommended` from each
source's own recommended set.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-dmmf
```

```ts
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-dmmf'],
  rules: { ...effectDmmf.configs.recommended.rules },
})
```

This is equivalent to registering all three source plugins and spreading each
one's `configs.recommended.rules`, except every rule is reported under the
`@systemfsoftware/oxlint-plugin-effect-dmmf/<rule-name>` namespace instead of
each source's own.

## What "recommended" means here

`configs.recommended.rules` is **not** every rule the three sources register —
it is exactly the union of what each source itself recommends. A source can
register a rule for individual opt-in without recommending it by default;
`effect-workflow`'s `workflow-inline-schemas` is one such rule today. That
choice survives the merge unchanged: `workflow-inline-schemas` is present in
`configs.rules` (so `'@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-inline-schemas': 'error'`
still works if you opt in explicitly) but absent from
`configs.recommended.rules`.

To adopt gradually, drop the spread and name rules individually as
`'@systemfsoftware/oxlint-plugin-effect-dmmf/<rule>': 'warn'`.

## Rules

See each source plugin's own README for its full rule table:

- [`effect-workflow`](../effect-workflow/README.md) — `*.workflow.ts` pure decisions
- [`effect-executor`](../effect-executor/README.md) — `*.executor.ts` operation shells
- [`property-testing`](../property-testing/README.md) — `*.property.test.ts` predicates

## Development

`src/index.ts` merges exactly three fixed, already-tested plugins with a
spread and a small rekey — there's no decision surface here for a test suite
or mutation gate to earn its keep. Verify a change by building and running
the result against real oxlint:

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-dmmf build
```
