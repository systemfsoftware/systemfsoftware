import { assertAliasOverlayIgnoresStripConfigPlantedInTempDir } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc alias overlay ignores a strip config planted in the
 * temp dir.
 *
 * The corollary hazard of anchoring discovery at the generated tsconfig: a
 * stray `strip.config.*` anywhere on the walk above the OS temp directory would
 * be honored for the build (samchon/ttsc#358). Re-anchoring at the project root
 * must keep the temp tree out of the walk entirely, not merely add the project
 * as a fallback.
 *
 * 1. Create a strip project with its own root `strip.config.json`, then redirect
 *    the OS temp dir to a directory holding a hostile `strip.config.json`.
 * 2. Call `transformTtsc` with a bundler alias so the generated tsconfig lands
 *    inside the redirected temp dir.
 * 3. Assert the project config is applied and the planted config's call list is
 *    not.
 */
export const test_transformttsc_alias_overlay_ignores_strip_config_planted_in_temp_dir =
  async () => {
    await assertAliasOverlayIgnoresStripConfigPlantedInTempDir();
  };
