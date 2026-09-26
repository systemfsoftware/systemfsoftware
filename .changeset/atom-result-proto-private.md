---
"@systemfsoftware/effect-atom": major
---

`AsyncResult.ResultProto` is no longer exported; build results with the `AsyncResult` constructors instead of spreading it. `AsyncResult.ResultSchema` is a concrete `AsyncResult` schema over a finite number and a string. `Atom.Registry` now also exports `dehydrate`, `hydrate`, `DehydratedAtom`, `DehydratedAtomValue` and `HydrationEntry`, which `Atom.Hydration` still exports.
