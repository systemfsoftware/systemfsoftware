---
"@systemfsoftware/oxlint-plugin-effect-platform": minor
---

`runtime-construction-placement` reports a factory that builds a fresh `ManagedRuntime` per call even when its returned closures capture it, and no longer reports `Layer.provide`, which composes a Layer graph and builds no runtime. Its fix message names `Layer.build` in the owner's scope for wiring that belongs to an object with its own lifetime.
