# AGENTS.md — `@systemfsoftware/stryker-plugins`

Stryker Ignorer plugins for Effect-TS: ignores proven-equivalent mutants on Schema declarations (brands, `TaggedClass`/`TaggedError` tags). Root `AGENTS.md` governs; `packages/stryker-js/AGENTS.md` carries the subtree rules.

## Contract

Each entry — `effect-schema-ignorer`, `in-source-test-ignorer`, `workflow-make-ignorer` — exports `strykerPlugins`: one `declarePlugin('Ignorer', <name>, makeIgnorer)` whose factory returns the pure `decide…Ignore` decision as `string | null`. Those names are the ones `ignorers` selects in config, and the barrel `src/mod.ts` concatenates the three. `@systemfsoftware/stryker-js` is a regular dependency; `effect` is a devDependency compiled into `dist`, never a published peer.

## Rules

| ID      | Rule                                                                                                                                                                 | Gate                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **SP1** | An ignored mutant is proven-equivalent: mutating the tag/brand field produces identical behavior.                                                                    | `pnpm --filter @systemfsoftware/stryker-plugins test` |
| **SP2** | Every new ignore pattern arrives with a test demonstrating the equivalent mutant.                                                                                    | `pnpm --filter @systemfsoftware/stryker-plugins test` |
| **SP3** | An ignore reaches Stryker only through the declared Ignorer contribution; no other mutation stage is bypassed.                                                       | `review`                                              |
| **SP4** | A contribution is plain `{ kind, name, make }` data declared with `declarePlugin`; no kind contributes an Effect `Layer`, and no published signature names `Effect`. | `review`                                              |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-plugins typecheck
pnpm --filter @systemfsoftware/stryker-plugins test
pnpm --filter @systemfsoftware/stryker-plugins lint
```
