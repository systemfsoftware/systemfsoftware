# AGENTS.md — `@systemfsoftware/effect-schema-law`

Single entry `.` exposing `ruleOfSchemas` (round-trip identity `decode(encode(x)) === x` and encode stability `encode(decode(encoded))` matches the original encoded form) and `recursionLaws`: termination, deep reachability, and variant coverage for a schema whose root is a recursive union declaring its budget with `terminatingRecursion` from `@systemfsoftware/effect-schema-extensions`. Usage: `README.md`. Root `AGENTS.md` governs.

## Rules

| ID         | Rule                                                                                                                                                                                                                                                     | Gate                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LAW-L1** | The law predicates must be able to say no: the suite pins them against a codec that decodes every input to one value, so a vacuous predicate fails.                                                                                                      | `pnpm --filter @systemfsoftware/effect-schema-law test` exits 0                                                                                                              |
| **LAW-L2** | Errors are exempt: law-test schemas that model data (structs, unions, branded values, `Schema.Class`/`TaggedClass`); never call `ruleOfSchemas` on a `Schema.TaggedError` — its `cause` is routinely `S.Unknown`, which carries no round-trip guarantee. | `pnpm --filter @systemfsoftware/effect-schema-vite test` exits 0 — its integration suite declares a `TaggedError` beside data schemas and asserts the discovered set exactly |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-schema-law typecheck
pnpm --filter @systemfsoftware/effect-schema-law test
pnpm --filter @systemfsoftware/effect-schema-law lint
```
