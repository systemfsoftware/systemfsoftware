---
"@systemfsoftware/stryker-js": minor
"@systemfsoftware/stryker-js-vitest-runner": minor
---

Plugin code can now ask for the module-loader service instead of touching the host module API: it exposes the same `createRequire`/`isBuiltin` surface as the host module module, and the Node engine supplies it automatically. Plugins that declare their environment through the engine's plugin declaration get the service without extra wiring; upgrades should move the engine and its plugins in the same release.
