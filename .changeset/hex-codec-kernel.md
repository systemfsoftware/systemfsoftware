---
"@systemfsoftware/hex-schema": patch
---

`prefixed-hex.schema.ts` and `uint8array-from-prefixed-hex.schema.ts` are now emitted from declarations, and the `0x`-prefix codec directions moved to a new internal `prefixed-hex.kernel.ts` as `stripHexPrefix` and `addHexPrefix`. The schemas encode and decode exactly as before; edit the declaration rather than the cell, which `check:cell-authorship` enforces.
