# @systemfsoftware/oxlint-plugin-effect-dmmf

A combined oxlint plugin aggregating all eighteen source plugins in this
family under one entrypoint: one package, one `jsPlugin`, every rule set
under one namespace.

This plugin defines no rules of its own. It re-exports the eighteen
sources' rules under one plugin name and composes `configs.recommended`
from each source's own recommended set.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-dmmf
```

### Normal adoption: extend a shareable config

The normal way in is oxlint's native composition mechanism — a config
object consumed via `extends`, with later configs winning on merge. In this
repository, `@systemfsoftware/oxlint-config` exports `./base`, which already
registers this composite as a `jsPlugin` and spreads its recommended set,
and `./strict`:

```ts
import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({ extends: [base] })
```

### Standalone use: a registration convenience, not the default

Standalone use is for a consumer who wants one plugin without adopting a
config. It is an internal registration convenience — one `jsPlugin` entry
instead of eighteen — not the recommended adoption surface:

```ts
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-dmmf'],
  rules: { ...effectDmmf.configs.recommended.rules },
})
```

The hand-spread is load-bearing. oxlint's plugin type is `{ meta?, rules }`:
`configs` is absent from it and the host never dereferences it, so
`configs.recommended` is inert metadata that takes effect only because a
config object spreads it into `rules` — which is exactly what `./base` does.
This standalone form is equivalent to registering all eighteen source
plugins and spreading each one's `configs.recommended.rules`, except every
rule is reported under the
`@systemfsoftware/oxlint-plugin-effect-dmmf/<rule-name>` namespace instead
of each source's own.

## What "recommended" means here

`configs.recommended.rules` is **not** every rule the eighteen sources
register — it is exactly the union of what each source itself recommends. A
source can register a rule for individual opt-in without recommending it by
default; `effect-workflow`'s `workflow-inline-schemas` is one such rule
today. That choice survives the merge unchanged: `workflow-inline-schemas`
is present in `configs.rules` (so
`'@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-inline-schemas': 'error'`
still works if you opt in explicitly) but absent from
`configs.recommended.rules`.

To adopt gradually, drop the spread and name a subset of rules individually
at `'error'`, narrowing blast radius instead of severity: start with fewer
rules and grow the set, or scope the rules to the files you are migrating
with an `overrides` entry. A rule you register but do not want is set to
`off`, never warn — a warn rule still runs and still costs its per-file
time.

## Rules

See each source plugin's own README for its full rule table. The composite
re-exports all eighteen sources:

- [`cell-imports`](../cell-imports/README.md)
- [`cell-taxonomy`](../cell-taxonomy/README.md) — `<name>.<cell>.ts` filenames
- [`effect-acl`](../effect-acl/README.md)
- [`effect-adapter`](../effect-adapter/README.md)
- [`effect-executor`](../effect-executor/README.md) — `*.executor.ts` operation shells
- [`effect-handler`](../effect-handler/README.md)
- [`effect-kernel`](../effect-kernel/README.md)
- [`effect-middleware`](../effect-middleware/README.md)
- [`effect-observer`](../effect-observer/README.md)
- [`effect-policy`](../effect-policy/README.md)
- [`effect-schema`](../effect-schema/README.md)
- [`effect-shape`](../effect-shape/README.md)
- [`effect-state`](../effect-state/README.md)
- [`effect-store`](../effect-store/README.md)
- [`effect-workflow`](../effect-workflow/README.md) — `*.workflow.ts` pure decisions
- [`property-testing`](../property-testing/README.md) — `*.property.test.ts` predicates
- `test-hygiene` — no README in this package; its rules live in `src/rules/`
- [`test-placement`](../test-placement/README.md)

## Development

`src/index.ts` merges exactly eighteen fixed, already-tested plugins with a
spread and a small rekey — there's no decision surface here for a test suite
or mutation gate to earn its keep. Verify a change by building and running
the result against real oxlint:

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-dmmf build
```
