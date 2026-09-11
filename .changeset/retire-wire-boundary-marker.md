---
"@systemfsoftware/effect-cell-types": major
---

Removes the `Wire` namespace: `Wire.wire`, `Wire.mint`, and the `Wire.Mark`, `Wire.Minted`, `Wire.AnyMinted`, `Wire.MintedField`, and `Wire.Fields` types. Build your schema structs with Effect Schema directly: `Wire.wire({ ... })` becomes `Schema.Struct({ ... })`, and `Wire.mint(schema)` becomes `schema` itself — the call never changed the schema. A foreign schema can again be placed directly as a struct member; nothing in this package refuses it.
