# AGENTS.md — `@systemfsoftware/effect-schema-bounded-union`

One export, `boundedUnion`: caps `Schema.Union` arbitrary-generation depth so a union recursing through a non-array field cannot overflow the stack. Usage: `README.md`. Root `AGENTS.md` governs.

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                                                               | Gate                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BU-R1** | The cap applies to generation only — decode, encode, and equivalence stay `Schema.Union`'s. Keep the returned value `S.Union([...base, ...recur])` with annotations; every depth concern lives inside the `toArbitrary` hook. Never filter/reorder members, alter a member's schema, or let `maxDepth` reach a decode/encode path. | `pnpm --filter @systemfsoftware/effect-schema-bounded-union test` — the in-source properties decode values deeper than `maxDepth` and assert acceptance |
| **BU-R2** | `identifier` is both the schema's identifier and the generator's `depthIdentifier` — keep it unique per recursive cycle; two cycles sharing one identifier share one depth budget and the second silently under-generates.                                                                                                         | `review`                                                                                                                                                |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-schema-bounded-union typecheck
pnpm --filter @systemfsoftware/effect-schema-bounded-union test
pnpm --filter @systemfsoftware/effect-schema-bounded-union lint
```
