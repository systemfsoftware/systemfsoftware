import { assertAliasOverlayDiscoversProjectBannerConfig } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc alias overlay discovers the project's banner config.
 *
 * A bundler alias makes the adapter compile through a generated tsconfig in the
 * system temp directory. `@ttsc/banner` anchors config discovery at the
 * tsconfig directory and, unlike strip, fails hard on a miss — so the alias
 * used to break the build with "no banner.config.{ts,...,json} file found" even
 * though the file sits next to the real tsconfig (samchon/ttsc#358).
 *
 * 1. Create a project with a root `banner.config.json` and a `@ttsc/banner`
 *    tsconfig entry.
 * 2. Call `transformTtsc` with a bundler alias so the generated tsconfig is used.
 * 3. Assert the transform succeeds and the banner text is prepended to the
 *    transformed source.
 */
export const test_transformttsc_alias_overlay_discovers_project_banner_config =
  async () => {
    await assertAliasOverlayDiscoversProjectBannerConfig();
  };
