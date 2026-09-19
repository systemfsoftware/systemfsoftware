// release-phase.ts — the release planner's decision, alone.
//
// `owed` is the release set: workspace versions the registry does not yet
// serve. `pending` is the change intents `.changeset/ledger.yaml` does not
// record as consumed.
//
// Pending intents win. A merge that adds an intent must open the version PR;
// publishing first ships that merge under the previous changelog. An
// unpublished version number that `pnpm version -r` bumps past was never on the
// registry, so abandoning it costs nothing a consumer could install.

export type ReleasePhase = 'publish' | 'version' | 'none'

export const decidePhase = (owed: number, pending: number): ReleasePhase =>
  pending > 0 ? 'version' : owed > 0 ? 'publish' : 'none'
