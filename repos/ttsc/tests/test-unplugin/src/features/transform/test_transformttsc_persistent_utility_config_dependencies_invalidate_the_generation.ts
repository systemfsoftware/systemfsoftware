import { assertPersistentUtilityConfigDependencyEditInvalidatesTransform } from "../../internal/transform-utility-plugin-config";

/**
 * Verifies persistent transform generations include modules evaluated by the
 * native banner and strip config loaders.
 *
 * 1. Compile banner and strip projects whose `.cjs` and `.ts` configs import
 *    external helper modules.
 * 2. Edit only each helper after the first cached generation.
 * 3. Assert both transforms replace the generation and emit the new behavior.
 */
export const test_transformttsc_persistent_utility_config_dependencies_invalidate_the_generation =
  async () => {
    await assertPersistentUtilityConfigDependencyEditInvalidatesTransform();
  };
