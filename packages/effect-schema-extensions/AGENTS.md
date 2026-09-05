# AGENTS.md — `@systemfsoftware/effect-schema-extensions`

Extra Effect Schema codecs (hex-string, prefixed-hex). Root `AGENTS.md` governs.

## Rules

| ID      | Rule                                                                                                                                        | Gate                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **EX1** | Every codec ships the trio: branded `Schema`, typed `decode`/`encode` wrappers, and an `arbitrary` fast-check generator for property tests. | `pnpm --filter @systemfsoftware/effect-schema-extensions test` |
| **EX2** | Every hex codec brands its output — bare string schemas violate Constitution §I.4 (no primitive obsession).                                 | `pnpm --filter @systemfsoftware/effect-schema-extensions lint` |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-schema-extensions typecheck
pnpm --filter @systemfsoftware/effect-schema-extensions test
pnpm --filter @systemfsoftware/effect-schema-extensions lint
```
