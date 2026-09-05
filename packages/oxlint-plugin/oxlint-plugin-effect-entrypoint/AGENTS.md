# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-entrypoint`

Shared conventions: `packages/oxlint-plugin/AGENTS.md`. Rules gate `main.ts` as a real interpretation edge.

## Rules

| ID      | Rule                                                                                              | Gate                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EP1** | Key rules on the exact basename `main.ts`, never on a cell-role suffix or a sanctioned cell list. | `grep -l 'ENTRYPOINT_FILE' packages/oxlint-plugin/oxlint-plugin-effect-entrypoint/src/rules/*.config.ts` returns exactly the three filename-gated configs |
| **EP2** | `entrypoint-no-exports` and `entrypoint-not-imported` stay enabled as a pair.                     | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                             |
| **EP3** | `entrypoint-interprets-once` is this package's OX-OB1 obligation.                                 | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                             |
| **EP4** | The two-edges trap is gated only in its direct syntactic form.                                    | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0                                                                             |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint lint
```
