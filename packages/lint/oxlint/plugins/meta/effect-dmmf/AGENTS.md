# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-dmmf`

Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. One-shot bundle: a plain object spread over the surviving sources (property-testing, test-hygiene, test-placement, effect-schema, effect-workflow) plus a `recommendedFrom` helper. No rule logic of its own — see `README.md#development`.

## Rules

| ID      | Rule                                                                                                                                                                                        | Gate                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **ED1** | Aggregation is verified on every change to `src/index.ts`: no two sources share a rule name, core is absent, every source-recommended rule is enabled under this bundle's own plugin name.  | `review` — mechanization via a colocated `src/__tests__/` suite does not exist yet; a named-but-unrunnable command is forbidden |
| **ED2** | Core (`@systemfsoftware/oxlint-plugin`) stays out of the imports, the dependencies map, and the exported rule keys.                                                                         | `grep -c "from '@systemfsoftware/oxlint-plugin'" src/index.ts` returns 0                                                        |
| **ED3** | Sources wire through `recommendedFrom` generically: re-export all of a source's rules, recommend only what its own `configs.recommended.rules` names; never hardcode a source's rule names. | `review` — every source appears exactly once in both the rules spread and the `configs.recommended` spread                      |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-dmmf typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-dmmf lint
```
