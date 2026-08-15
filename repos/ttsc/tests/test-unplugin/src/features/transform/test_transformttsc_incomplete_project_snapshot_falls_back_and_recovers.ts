import { assertIncompleteProjectSnapshotFallsBackAndRecovers } from "../../internal/transform-project-cache";

/**
 * Verifies a transient project-walk failure cannot make a partial snapshot
 * permanently authoritative.
 *
 * A graph-bearing generation normally uses narrow persistent validation. If one
 * subtree could not be enumerated, that shortcut would omit its files and could
 * replay stale output forever after the filesystem recovered.
 *
 * 1. Fail one nested-directory read during the generation snapshot.
 * 2. Restore the filesystem and request the same module again.
 * 3. Assert full fallback detects the missing keys and replaces the generation.
 */
export const test_transformttsc_incomplete_project_snapshot_falls_back_and_recovers =
  async () => {
    await assertIncompleteProjectSnapshotFallsBackAndRecovers();
  };
