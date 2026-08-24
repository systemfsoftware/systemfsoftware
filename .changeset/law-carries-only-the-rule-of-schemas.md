---
"@systemfsoftware/effect-schema-law": major
---

The package now has two entry points, and `boundedUnion` has moved out.

The default entry exports `ruleOfSchemas` — the round-trip identity and encode-stability laws the package is named for. The refusal and adequacy surface (`refutes`, `scanObligations`, `obligationsOf`, `dischargedBy`, `adequacyReport`, `discriminates`, `armsOf`, `WITNESS_BUDGET`, and the `Obligation`, `ObligationScan`, `BlindArm`, `Arm`, `AdequacyReport` and `RefusalGenerators` types) now lives one level down.

If `ruleOfSchemas` is all you call, upgrade and change nothing. If you call the refusal surface, add `/refutation` to the import:

```ts
import { refutes, scanObligations } from '@systemfsoftware/effect-schema-law/refutation'
```

Importing the default entry does not load the refusal surface, so a project that only law-tests its codecs pays for nothing else.

The `boundedUnion` codec constructor is no longer here. It builds a schema your application decodes production input with, which makes it a runtime codec rather than a test helper, so it ships on its own and requires only `effect` — installing it no longer brings a test runner along:

```sh
pnpm add @systemfsoftware/effect-schema-bounded-union
```
