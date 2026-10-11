# Mutation baseline reasons - discern

Every id in `mutation-baseline.json` has one row here, sorted by id. `## Justified` rows say why no test can tell the mutant from the original; `## Debt` rows are survivors seeded unjudged.

## Justified

| id                 | file:line                         | mutator -> replacement | reason                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7e331bf8a93e204a` | `src/ContentAddress.schema.ts:32` | StringLiteral -> `""`  | this changes only the opaque token for the value `undefined` before it is digested at `src/ContentAddress.schema.ts:32`; `hash` still returns a string for every input the totality property draws, and no law compares two addresses by digest (a string and its token already collide by design), so only a golden address table could reveal it |
| `ea3bab5a429b51e5` | `src/ContentAddress.schema.ts:87` | StringLiteral -> `""`  | this changes only the `_tag` literal stamped into a probability decision's canonical form at `src/ContentAddress.schema.ts:87`; two distinct probability decisions still fingerprint differently and a probability still differs from a rate, so no law can observe it and only a golden fingerprint could                                         |
