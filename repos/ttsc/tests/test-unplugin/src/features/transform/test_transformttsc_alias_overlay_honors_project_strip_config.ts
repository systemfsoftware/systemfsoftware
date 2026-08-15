import { assertAliasOverlayHonorsProjectStripConfig } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc alias overlay honors the project's strip config.
 *
 * A bundler alias makes the adapter compile through a generated tsconfig in the
 * system temp directory. `@ttsc/strip` anchors config discovery at the tsconfig
 * directory, so without the explicit `TTSC_PLUGIN_CONFIG_DIR` channel the
 * upward walk starts at the temp tree, finds nothing, and strip silently
 * applies its built-in defaults — the user's configured call list is ignored
 * with no error (samchon/ttsc#358).
 *
 * 1. Create a project with a root `strip.config.json` stripping `logger.trace`
 *    (not a default) and a `@ttsc/strip` tsconfig entry.
 * 2. Call `transformTtsc` with a bundler alias so the generated tsconfig is used.
 * 3. Assert `logger.trace` is stripped and `console.log` (a default strip target)
 *    survives — the project config won, not the defaults.
 */
export const test_transformttsc_alias_overlay_honors_project_strip_config =
  async () => {
    await assertAliasOverlayHonorsProjectStripConfig();
  };
