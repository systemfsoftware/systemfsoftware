---
"@systemfsoftware/oxlint-plugin-effect-platform": minor
---

`runtime-construction-placement` reports a factory that builds a fresh `ManagedRuntime` per call even when its returned closures capture it, accepts a runtime made inside the acquire of `Effect.acquireRelease` with a release (one runtime per object instance, finalized with its scope), and no longer reports `Layer.provide`, which composes a Layer graph and builds no runtime.
