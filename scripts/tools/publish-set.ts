// publish-set.ts — the two decisions the publish step makes about the release
// set: which packages pnpm may consider, and whether a failed publish is
// nevertheless that release's outcome.
//
// Both exist because pnpm re-derives "is this version published?" on its own,
// and its probe is the staler of the two facts. It resolves against npm's
// abbreviated packument, which the registry serves with `cache-control:
// public, max-age=300` (measured 2026-09-23 on the document for a version
// published three minutes earlier: `cf-cache-status: HIT`, `last-modified`
// equal to the publish second). For five minutes after a publish that
// document still reads the version as absent, so `pnpm publish -r` PUTs it
// again; npm answers a duplicate with 403 "You cannot publish over the
// previously published versions" and abandons the rest of the set — every
// version that could have shipped with it.
//
// `./cycle.ts` reads `/<name>/<version>` instead, which the registry does not
// cache (`cf-cache-status: DYNAMIC`), so the release set is the fresher fact.
// Narrowing pnpm's recursion to it is what keeps the step from publishing
// anything the registry already settled; settling the verdict against the
// registry afterwards is what makes the step idempotent when the two
// disagree in the other direction.

import type { CycleEntry } from './cycle.ts'
import type { WorkspaceMember } from './workspace.ts'

/**
 * `pnpm publish -r` scoped to the captured set. `--filter` narrows
 * `selectedProjectsGraph`, the only input pnpm's recursive publish maps over;
 * without it pnpm walks every non-private workspace member and picks its own
 * set from its own stale probe. `--fail-if-no-match` is what keeps a filter
 * that matches nothing from exiting 0 with nothing published.
 */
export const publishArgs = (cycle: readonly CycleEntry[]): string[] => [
  'publish',
  '-r',
  '--provenance',
  '--access',
  'public',
  '--no-git-checks',
  '--fail-if-no-match',
  ...cycle.flatMap(({ name }) => ['--filter', name]),
]

/**
 * Captured entries this workspace does not manifest — deleted, renamed, made
 * private, or captured at a version the manifest no longer carries. pnpm
 * selects projects, not versions, so a name it cannot match drops out of the
 * publish silently and the entry's own version is never checked against the
 * manifest: without this check the tag and GitHub Release steps would still
 * run for a version npm never received.
 */
export const staleEntries = (
  cycle: readonly CycleEntry[],
  members: readonly WorkspaceMember[],
): CycleEntry[] =>
  cycle.filter(({ name, version }) => !members.some((member) => member.name === name && member.version === version))

/** `name@version` per entry, for a message a reader can act on. */
export const labeled = (cycle: readonly CycleEntry[]): string =>
  cycle.map(({ name, version }) => `${name}@${version}`).join(', ')

/**
 * The step's verdict, settled against the registry rather than against the
 * publisher's exit code. `owed` is the release set re-checked after the
 * attempt: a nonzero exit with nothing owed is a release that happened — the
 * publisher's view of the registry was stale, the registry's was not.
 */
export const publishVerdict = (
  succeeded: boolean,
  owed: readonly CycleEntry[],
): 'published' | 'converged' | 'owed' => {
  if (succeeded) return 'published'
  return owed.length === 0 ? 'converged' : 'owed'
}
