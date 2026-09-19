// workspace.ts — the one parse of `pnpm ls -r --json`.
//
// Three callers need the non-private workspace set, each for a different
// projection: the release set (`cycle.ts`, name + version), `publish:unpublished`
// (`oidc.ts`, the manifest beside each package), and the publish-status report
// (`check-npm-publish.ts`, name + directory). Each walked `pnpm ls -r` itself
// once; the shape of that walk belongs in one place so a fix reaches all three.

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
