# @systemfsoftware/effect-e2e

Effect-native end-to-end testing. This package is the runtime-neutral core: a suite's `e2e.config.ts` builds its config with `defineConfig` and the `web()` engine spec, and the runner decodes that plain data once at the edge with `decodeConfig`, failing `ConfigInvalid` with the key path of any unknown or invalid value. Importing the package runs nothing.

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e#readme).
