import { assertPersistentBannerConfigEditInvalidatesTransform } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies transformTtsc: reloads an edited implicit banner config.
 *
 * The native banner driver discovers `banner.config.*` outside the TypeScript
 * reference graph. Persistent per-file validation must still treat the chosen
 * file and its higher-priority discovery probes as universal host inputs.
 *
 * 1. Transform with an implicitly discovered config containing `OLD BANNER`.
 * 2. Edit only that config while retaining the transform cache.
 * 3. Assert the next delivery contains `NEW BANNER` from a new generation.
 */
export const test_transformttsc_persistent_banner_config_edit_invalidates_transform =
  async () => {
    await assertPersistentBannerConfigEditInvalidatesTransform();
  };
