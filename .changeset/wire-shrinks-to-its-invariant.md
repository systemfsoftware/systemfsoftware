---
'@systemfsoftware/effect-cell-types': major
---

The wire surface is now the seven symbols it always claimed to be: the mark,
the minted types, `mint`, `Fields` and `wire`. Fifteen convenience wrappers
around the schema library are gone. A member you built with a wrapper decodes
to exactly what it decoded to before; only the spelling changed.

To migrate, wrap the schema library member in `mint` where you used a wrapper:

- `string`, `number`, `boolean`, `integer` → `mint(S.String)`,
  `mint(S.Finite)`, `mint(S.Boolean)`, `mint(S.Int)`
- `literal(...v)` → `mint(S.Literals([...v]))`; `union(...m)` →
  `mint(S.Union([...m]))`; `tuple(...t)` → `mint(S.Tuple([...t]))`
- `nullOr(m)` / `undefinedOr(m)` / `nullishOr(m)` / `array(m)` /
  `optional(m)` / `record(k, v)` / `suspend(t)` → the same letter under
  `mint`, e.g. `mint(S.NullOr(m))`, `mint(S.Array(m))`, `mint(S.Record(k, v))`
- `refine(m, predicate)` → `mint(S.refine(predicate)(m))`
