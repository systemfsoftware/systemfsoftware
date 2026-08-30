## 2.1.0

### Minor Changes

- Plugin code can now ask for the module-loader service instead of touching the host module API: it exposes the same `createRequire`/`isBuiltin` surface as the host module module, and the Node engine supplies it automatically. Plugins that declare their environment through the engine's plugin declaration get the service without extra wiring; upgrades should move the engine and its plugins in the same release.

### Patch Changes

- Refreshed builds on the platform-services dependency graph; the packages no longer reach for host builtins directly. No CLI flags or option names change.

- Updated dependencies:
  - @systemfsoftware/stryker-js@0.2.0
