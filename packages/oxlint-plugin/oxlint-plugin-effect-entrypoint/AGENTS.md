# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-entrypoint`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. Rules gate `main.ts` as a real interpretation edge.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                           | Gate                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EP1** | Key rules on the exact basename `main.ts`, never on a cell-role suffix or a sanctioned cell list.                                                                                                                                                                                                              | `grep -l 'ENTRYPOINT_FILE' packages/oxlint-plugin/oxlint-plugin-effect-entrypoint/src/rules/*.config.ts` returns exactly the three configs carrying the entry designation |
| **EP2** | `entrypoint-no-exports` and `entrypoint-not-imported` stay enabled as a pair.                                                                                                                                                                                                                                  | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                                             |
| **EP3** | `entrypoint-interprets-once` is this package's OX-OB1 obligation.                                                                                                                                                                                                                                              | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                                             |
| **EP4** | The two-edges trap is gated only in its direct syntactic form.                                                                                                                                                                                                                                                 | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                                             |
| **EP5** | `runtime-construction-placement` is not entry-gated: construction placement is judged in every file by shape, so its config carries no `ENTRYPOINT_FILE`; the one filename input is the type-test exemption — a `.tst.ts` file runs nowhere and is out of scope, while runtime `.test.ts` files stay in scope. | `grep -L 'ENTRYPOINT_FILE' packages/oxlint-plugin/oxlint-plugin-effect-entrypoint/src/rules/runtime-construction-placement.config.ts` prints that path                    |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint lint
```
