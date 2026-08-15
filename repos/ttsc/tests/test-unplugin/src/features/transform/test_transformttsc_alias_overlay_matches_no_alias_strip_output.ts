import { assertAliasOverlayMatchesNoAliasStripOutput } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc alias overlay matches the no-alias strip output.
 *
 * The positive twin of the alias + strip.config scenario: a project with no
 * alias compiles through the original tsconfig (the passthrough lane), so its
 * output is the reference for what the generated-tsconfig lane must produce.
 * Any divergence would mean the `TTSC_PLUGIN_CONFIG_DIR` anchor changes
 * behavior beyond repairing discovery.
 *
 * 1. Create a project with a root `strip.config.json` and a `@ttsc/strip` tsconfig
 *    entry.
 * 2. Call `transformTtsc` twice: once with a bundler alias, once without.
 * 3. Assert both outputs strip the configured call and are byte-identical.
 */
export const test_transformttsc_alias_overlay_matches_no_alias_strip_output =
  async () => {
    await assertAliasOverlayMatchesNoAliasStripOutput();
  };
