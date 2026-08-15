---
"@systemfsoftware/hex-schema": patch
---

The `0x`-prefix codec directions move to a new internal `prefixed-hex.kernel.ts` as `stripHexPrefix` and `addHexPrefix`. `prefixed-hex.schema.ts` and `uint8array-from-prefixed-hex.schema.ts` encode and decode exactly as before.
