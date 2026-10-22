---
"@systemfsoftware/effect-e2e": minor
---

New package. `@systemfsoftware/effect-e2e` publishes the suite config edge: `defineConfig` and `web(...)` build an `e2e.config.ts` as plain data, the `unique`, `secrets` and `credentials` helpers name values the run resolves later, and `decodeConfig(value, defaults)` decodes it once into an `E2EConfig` with every default filled, or fails with `ConfigInvalid` naming the key path that broke. Importing the package performs no effects.
