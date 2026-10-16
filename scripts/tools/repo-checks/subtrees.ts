// A vendored subtree is read-only: its tree at HEAD must equal the tree of the
// squash commit `git subtree add|pull --squash` last brought in. The subtree
// directories are the ones git-subtree itself declares in its commit trailers,
// so any edit made by any tool, then committed, moves the tree and fails. A
// declared directory still present at HEAD with no squash to compare against
// is undecided, never a silent pass, unless another directory already
// violates; one removed from HEAD has no tree left to misreport its upstream
// and is skipped.
//
// A squash commit carries `git-subtree-dir` and `git-subtree-split` and no
// `git-subtree-mainline`, and is reached only through a merge's second parent.
// Mainline commits can carry the same trailers (a squash-merged pull request
// copies them into its message), so a commit on HEAD's first-parent chain is
// never taken as the squash.
import { git, holds, objectAt, Undecided, type Verdict, violated } from './verdict.ts'

export interface TrailerCommit {
  readonly commit: string
  readonly dirs: readonly string[]
  readonly splits: readonly string[]
  readonly mainlines: readonly string[]
}

const RECORD = '\x1e'
const FIELD = '\x1f'
const VALUE = '\x1d'

/** Newest-first squash commit per subtree directory; a squash declares exactly one directory. */
export const latestSquashes = (
  commits: readonly TrailerCommit[],
  firstParent: ReadonlySet<string>,
): ReadonlyMap<string, string> => {
  const squashes = new Map<string, string>()
  for (const { commit, dirs, splits, mainlines } of commits) {
    const [dir] = dirs
    const squash = dir !== undefined && dirs.length === 1 && splits.length === 1 && mainlines.length === 0 &&
      !firstParent.has(commit)
    if (squash && !squashes.has(dir)) squashes.set(dir, commit)
  }
  return squashes
}

const values = (field: string): readonly string[] =>
  field.split(VALUE).map((value) => value.trim().replace(/\/+$/, '')).filter((value) => value.length > 0)

const trailerCommits = async (): Promise<readonly TrailerCommit[]> => {
  const trailer = (key: string) => `%(trailers:key=${key},valueonly,separator=%x1d)`
  const format = ['%H', trailer('git-subtree-dir'), trailer('git-subtree-split'), trailer('git-subtree-mainline')]
    .join('%x1f') + '%x1e'
  const out = await git(['log', '--topo-order', `--format=${format}`, 'HEAD'])
  return out.split(RECORD).flatMap((record) => {
    const [commit = '', dirs = '', splits = '', mainlines = ''] = record.trim().split(FIELD)
    return commit.trim().length > 0
      ? [{ commit: commit.trim(), dirs: values(dirs), splits: values(splits), mainlines: values(mainlines) }]
      : []
  })
}

export const checkSubtrees = async (): Promise<Verdict> => {
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Undecided(
      'the history is shallow, so the squash commits are out of reach; fetch the commit graph first: git fetch --filter=tree:0 --unshallow',
    )
  }
  const firstParent = new Set((await git(['rev-list', '--first-parent', 'HEAD'])).split('\n').filter(Boolean))
  const commits = await trailerCommits()
  const squashes = latestSquashes(commits, firstParent)
  const declared = [...new Set(commits.flatMap(({ dirs }) => dirs))].sort()
  const violations: string[] = []
  const unresolved: string[] = []
  let present = 0
  for (const dir of declared) {
    const head = await objectAt('HEAD', dir)
    if (head === null) continue
    const squash = squashes.get(dir)
    if (squash === undefined) {
      unresolved.push(dir)
      continue
    }
    present++
    const vendored = (await git(['rev-parse', `${squash}^{tree}`])).trim()
    if (head.id === vendored) continue
    if (head.type !== 'tree') {
      violations.push(`${dir}: replaced by a ${head.type}, vendored by squash ${squash.slice(0, 12)}`)
      continue
    }
    const changed = (await git(['diff', '--name-status', vendored, head.id])).trim().split('\n')
    violations.push(
      `${dir}: differs from squash ${squash.slice(0, 12)} in ${changed.length} path(s)`,
      ...changed.slice(0, 10).map((line) => `  ${line}`),
    )
  }
  if (violations.length > 0) {
    return violated(
      violations,
      'A vendored subtree changes only through `git subtree pull --squash`. Make the change upstream and pull it.',
    )
  }
  if (unresolved.length > 0) {
    throw new Undecided(
      `${
        unresolved.join(', ')
      }: git-subtree declares each and HEAD holds each, but no squash commit is reachable to compare`,
    )
  }
  return holds(`${present} subtree(s) match the squash commit that vendored them`)
}
