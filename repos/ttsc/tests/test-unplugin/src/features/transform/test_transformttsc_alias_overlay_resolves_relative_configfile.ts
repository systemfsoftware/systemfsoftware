import { assertAliasOverlayResolvesRelativeConfigFile } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc alias overlay resolves a relative configFile against
 * the project.
 *
 * A `configFile` on a tsconfig-declared plugin entry reaches the Go side
 * verbatim (the generated tsconfig only `extends` the project one, it does not
 * rewrite its entries), and the plugins resolve relative paths against the
 * tsconfig directory — the temp dir under an alias overlay, so the path used to
 * dangle with a not-found error (samchon/ttsc#358).
 *
 * 1. Create a project whose `@ttsc/banner` entry sets `configFile:
 *    "./config/banner.config.json"`.
 * 2. Call `transformTtsc` with a bundler alias so the generated tsconfig is used.
 * 3. Assert the transform succeeds and the referenced banner text appears in the
 *    transformed source.
 */
export const test_transformttsc_alias_overlay_resolves_relative_configfile =
  async () => {
    await assertAliasOverlayResolvesRelativeConfigFile();
  };
