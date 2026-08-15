import { assertPersistentValidationUsesPerFileInputs } from "../../internal/transform-project-cache";

/**
 * Verifies persistent validation is bounded by each delivered file's inputs.
 *
 * A graph-bearing whole-project result carries inputs for every output, but a
 * Vite serve or worker cache must not reread that union before every module. It
 * still has to reject relevant edits and project-membership changes.
 *
 * 1. Replay a partitioned graph and assert bounded reads per module.
 * 2. Prove an unreachable external edit keeps the generation while a reachable
 *    edit replaces it.
 * 3. Add a new ambient project file and assert directory membership replaces the
 *    generation too.
 */
export const test_transformttsc_persistent_validation_uses_per_file_inputs =
  async () => {
    await assertPersistentValidationUsesPerFileInputs();
  };
