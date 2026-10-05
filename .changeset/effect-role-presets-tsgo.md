---
"@systemfsoftware/tsconfig": minor
---

The `effect` and `effect/entrypoint` presets now enforce every `@effect/tsgo` 0.48.1 diagnostic at `error` — all 118 in the library role, and all but `nodeBuiltinImport` in the entrypoint role. The entrypoint preset declares that omission as an opt-in instead of letting the diagnostic fall back to its upstream default. The library preset's `allowedUnstableApis` allows `effect/http` and `effect/observability`; the entrypoint preset adds `effect/testing`. The declared grants are published as the new `@systemfsoftware/tsconfig/opt-ins.json` export.
