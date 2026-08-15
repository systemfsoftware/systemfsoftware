import { assertCompileSnapshotAbaRaceCannotAuthorizeStaleOutput } from "../../internal/transform-project-cache";

/** Verifies transformTtsc rejects an ABA mutation during native compilation. */
export const test_transformttsc_compile_snapshot_aba_race_cannot_authorize_stale_output =
  async () => {
    await assertCompileSnapshotAbaRaceCannotAuthorizeStaleOutput();
  };
