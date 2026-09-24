---
"@systemfsoftware/effect-cell-types": minor
---

A handle kind can type its slot by the handle's index. Declare the slot as an interface extending `Handle.Indexed` whose `slot` reads `this['Index']`, and pass the index bound as the third type argument of `Handle.make<Data, Slot, X>()`. `Definition.make<A>(data, slot)` mints a handle at index `A`, and `Definition.slot(handle)` returns the slot typed at that handle's index, so a handle generic over a value (a reference cell over `A`) keeps `A` when its slot is read back. Handles with a plain slot or no slot are unchanged.
