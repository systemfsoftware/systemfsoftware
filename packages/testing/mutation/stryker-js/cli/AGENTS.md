# AGENTS.md — `@systemfsoftware/stryker-js-cli`

The `stryker` bin: NDJSON run-event framing, mode/colour detection, signal handling, drain-before-exit, classed exit code. Parent: `packages/testing/mutation/stryker-js/AGENTS.md`.

## Rules

| ID         | Rule                                                                                                                                                                                                                                                                                                                 | Gate                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **CLI-B1** | Never drop the `prepare` script (`tsdown`) and never point `bin` at a committed shim: the bin target is gitignored `dist/main.mjs`, and pnpm links `.bin` shims before and after lifecycle scripts — without `prepare` the shim targets nothing and `stryker run` dies with `stryker: not found` on a fresh install. | Fresh `pnpm install` followed by `pnpm --filter @systemfsoftware/stryker-js-cli exec stryker --help` exits 0 |
| **CLI-M1** | Mutation scope is whatever `stryker.config.json#mutate` currently declares — read the config, never trust a filename written in prose.                                                                                                                                                                               | `pnpm check:stryker-mutate-scope`                                                                            |
| **CLI-S1** | `package.json#exports` and `publishConfig.exports` are tsdown-generated (REPO-S4); change the `exports` block in `tsdown.config.ts` (`exclude: ['main']`, `bin: { stryker: './src/main.ts' }`).                                                                                                                      | `pnpm --filter @systemfsoftware/stryker-js-cli build` regenerates cleanly                                    |
| **CLI-L1** | `oxlint.config.ts` extends `oxlint-config/base` and registers the effect-entrypoint and test-placement plugins explicitly — they are not in the `effect-dmmf` bundle, and this package's subject is an interpretation edge.                                                                                          | `pnpm --filter @systemfsoftware/stryker-js-cli lint` exits 0                                                 |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-cli typecheck
pnpm --filter @systemfsoftware/stryker-js-cli test
pnpm --filter @systemfsoftware/stryker-js-cli test:contract
pnpm --filter @systemfsoftware/stryker-js-cli lint
```
