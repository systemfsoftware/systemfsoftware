---
"@systemfsoftware/tsconfig": minor
---

The `effect` and `effect/entrypoint` presets now set every diagnostic the Effect language service ships to `error`. The library preset enables all of them; the entrypoint preset enables all but `nodeBuiltinImport` and `strictEffectProvide`, which it omits by design for tests, examples, and composition code. Naming an omitted diagnostic in your own config re-enables it. The library preset allows the `effect/http` and `effect/observability` unstable APIs; the entrypoint preset additionally allows `effect/testing`. Consumers extending either preset inherit the policy, and the declared opt-ins are published alongside the presets.
