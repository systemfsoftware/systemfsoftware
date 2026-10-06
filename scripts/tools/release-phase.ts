// release-phase.ts — the release planner's decision, alone.
//
// `owed` is the release set: workspace versions that carry no git tag yet
// (`./cycle.ts`). `pending` is the change intents `.changeset/ledger.yaml` does
// not record as consumed.
//
// Pending intents win. A merge that adds an intent must open the version PR;
// releasing first would tag and cut a GitHub Release under the previous
// changelog. An untagged version `pnpm version -r` bumps past was never
// released, so abandoning it strands no git ref a consumer pinned.

export type ReleasePhase = 'release' | 'version' | 'none'

export const decidePhase = (owed: number, pending: number): ReleasePhase =>
  pending > 0 ? 'version' : owed > 0 ? 'release' : 'none'
