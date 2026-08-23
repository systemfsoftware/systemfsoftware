---
"@systemfsoftware/effect-schema-law": major
---

The package now exports only `ruleOfSchemas` — the round-trip identity and encode-stability laws it is named for.

The refusal and adequacy exports (`refutes`, `scanObligations`, `obligationsOf`, `dischargedBy`, `adequacyReport`, `discriminates`, `armsOf`, `WITNESS_BUDGET`, and the `Obligation`, `ObligationScan`, `BlindArm`, `Arm`, `AdequacyReport` and `RefusalGenerators` types) now live in `@systemfsoftware/effect-schema-refutation`. The `boundedUnion` codec constructor now lives in `@systemfsoftware/effect-schema-bounded-union`.

If `ruleOfSchemas` is all you call, upgrade and change nothing. Otherwise install the package that now owns the export and re-point the import:

```sh
pnpm add -D @systemfsoftware/effect-schema-refutation
pnpm add @systemfsoftware/effect-schema-bounded-union
```
