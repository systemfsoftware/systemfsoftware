import { assertExternalCompileSnapshotAbaRaceCannotAuthorizeStaleOutput } from "../../internal/transform-project-cache";

/** External graph inputs retain the compiler-time, not restored, state. */
export const test_transformttsc_external_compile_snapshot_aba_race_cannot_authorize_stale_output =
  async () => {
    await assertExternalCompileSnapshotAbaRaceCannotAuthorizeStaleOutput();
  };
