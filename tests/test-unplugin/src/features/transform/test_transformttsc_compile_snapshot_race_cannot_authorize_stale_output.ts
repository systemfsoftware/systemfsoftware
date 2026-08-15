import { assertCompileSnapshotRaceCannotAuthorizeStaleOutput } from "../../internal/transform-project-cache";

/**
 * Verifies transformTtsc: rejects a torn compile/snapshot generation.
 *
 * A project input can change after the native transform has read it but before
 * the JavaScript host captures persistent-cache hashes. Blessing the later hash
 * beside the earlier output would make stale code authoritative indefinitely.
 *
 * 1. Change an unserved sibling after the native transform returns but before the
 *    generation snapshot walk reads it.
 * 2. Request that sibling from the cache.
 * 3. Assert a second transform runs and the post-change source is returned.
 */
export const test_transformttsc_compile_snapshot_race_cannot_authorize_stale_output =
  async () => {
    await assertCompileSnapshotRaceCannotAuthorizeStaleOutput();
  };
