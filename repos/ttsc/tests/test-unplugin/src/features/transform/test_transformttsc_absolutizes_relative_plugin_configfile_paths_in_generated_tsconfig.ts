import { assertTransformAbsolutizesPluginConfigFilePaths } from "../../internal/transform-compiler-options";

/**
 * Verifies transformTtsc absolutizes relative plugin configFile paths in the
 * generated tsconfig.
 *
 * The generated tsconfig is written to a temp directory outside the project
 * root. `configFile` is the config-file override the shipped utility plugins
 * (`@ttsc/banner`, `@ttsc/strip`, `@ttsc/lint`) accept, yet it was missing from
 * the adapter's absolutized key list (samchon/ttsc#358) — a relative value
 * survived verbatim and later resolved against the temp dir. This pins that
 * `transformTtsc` resolves relative `configFile` paths to absolute paths before
 * writing the temp tsconfig.
 *
 * 1. Create a fixture project with no plugins in its tsconfig.
 * 2. Write a `fixture.config.json` at the project root.
 * 3. Call `transformTtsc` with an inline plugin that carries a relative
 *    `configFile: "./fixture.config.json"` and uses the
 *    `assert-config-file-path` operation so the plugin itself verifies the path
 *    is absolute.
 * 4. Assert the transform succeeds and the output contains the plugin marker.
 */
export const test_transformttsc_absolutizes_relative_plugin_configfile_paths_in_generated_tsconfig =
  async () => {
    await assertTransformAbsolutizesPluginConfigFilePaths();
  };
