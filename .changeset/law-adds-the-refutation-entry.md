---
"@systemfsoftware/effect-schema-law": major
---

The package now has two entry points, and `boundedUnion` has moved out.

The default entry exports `ruleOfSchemas` — the round-trip identity and encode-stability laws the package is named for. The refusal and adequacy surface now lives one level down. If `ruleOfSchemas` is all you call, upgrade and change nothing. Otherwise add `/refutation` to the import:

```ts
import { refutes, scanObligations } from '@systemfsoftware/effect-schema-law/refutation'
```

Resolving it needs `moduleResolution` set to `bundler`, `node16` or `nodenext`; the legacy `node` setting reads no entry-point map, so the refusal surface is unreachable there.

`boundedUnion` builds a schema your application decodes production input with, so it now ships on its own and requires only `effect` — installing it no longer brings a test runner along:

```sh
pnpm add @systemfsoftware/effect-schema-bounded-union
```
