import { assertMetroBuildKeepsRuntimeDependenciesExternal } from "../../internal/metro-build";

/**
 * Verifies the Metro package build keeps `@ttsc/unplugin` external and needs no
 * Node-24-only rollup tooling.
 *
 * Bundling `@ttsc/unplugin` into the Metro output would inflate the artifact
 * and shadow the version the consuming project installed. Separately, the build
 * used to externalise dependencies through `rollup-plugin-node-externals`,
 * whose v9 calls the ES2025 `RegExp.escape` and so requires Node 24 — it
 * crashed the rollup build on Node 22. The config now derives its external set
 * straight from package.json. This pins both invariants so neither regresses.
 *
 * 1. Read the built CJS and ESM `transformer` outputs and `rollup.config.mjs`.
 * 2. Assert `@ttsc/unplugin/api` stays a runtime import in both outputs.
 * 3. Assert the config no longer imports `rollup-plugin-node-externals` /
 *    `rollup-plugin-auto-external`, and no virtual-module shims are inlined.
 */
export const test_package_build_keeps_runtime_dependencies_external = () => {
  assertMetroBuildKeepsRuntimeDependenciesExternal();
};
