import { assertCompletenessNarrowsPersistentCacheValidation } from "../../internal/transform-complete";

/**
 * Verifies `dependenciesComplete` narrows persistent cache validation per file.
 *
 * Completeness transfers the file's dependency ownership to the plugin. An
 * undeclared graph member must therefore be ignored by both watch registration
 * and cache validation, while declared dependencies and configs remain inputs.
 *
 * 1. Transform a file declared complete beside an undeclared external edge.
 * 2. Edit only that external file and request the same module again.
 * 3. Assert the cached generation remains authoritative.
 */
export const test_transformttsc_completeness_narrows_persistent_cache_validation =
  async () => {
    await assertCompletenessNarrowsPersistentCacheValidation();
  };
