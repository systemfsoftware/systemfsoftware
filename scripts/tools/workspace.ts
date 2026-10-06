// workspace.ts — the one parse of `pnpm ls -r --json`.
//
// Two callers need the non-private workspace set, each for a different
// projection: the release set (`cycle.ts`, name + version) and the captured-set
// stale check (`tag-released-packages.ts`, name + version). Each walked
// `pnpm ls -r` itself once; the shape of that walk belongs in one place so a
// fix reaches both.

import { run } from './run.ts'

export type WorkspaceMember = {
  readonly name: string
  readonly version: string
  readonly path: string
}

type RawMember = {
  name?: string
  version?: string
  path?: string
  private?: boolean
}

/** Every non-private workspace package, with the fields the walk can supply. */
export const rawWorkspacePackages = async (): Promise<WorkspaceMember[]> => {
  const pkgs = JSON.parse(await run('pnpm', ['ls', '-r', '--json', '--depth=-1'])) as RawMember[]
  return pkgs.filter(
    (pkg): pkg is RawMember & WorkspaceMember => Boolean(pkg.name && pkg.version && pkg.path) && !pkg.private,
  )
}
