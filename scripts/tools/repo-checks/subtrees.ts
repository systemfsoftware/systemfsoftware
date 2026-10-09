// A vendored subtree is read-only: its tree at HEAD must equal the tree of the
// squash commit `git subtree add|pull --squash` last brought in. The subtree
// directories are the ones git-subtree itself declares in its commit trailers,
// so any edit made by any tool, then committed, moves the tree and fails.
//
// A squash commit carries `git-subtree-dir` and `git-subtree-split` and no
// `git-subtree-mainline`, and is reached only through a merge's second parent.
// Mainline commits can carry the same trailers (a squash-merged pull request
// copies them into its message), so a commit on HEAD's first-parent chain is
// never taken as the squash.
import { git, holds, Undecided, type Verdict, violated } from './verdict.ts'

export interface TrailerCommit {
  readonly commit: string
  readonly dir: string
  readonly split: string
  readonly mainline: string
}

const FIELD = '\x1f'
const RECORD = '\x1e'

/** Newest-first squash commit per subtree directory. */
export const latestSquashes = (
  commits: readonly TrailerCommit[],
  firstParent: ReadonlySet<string>,
): ReadonlyMap<string, string> => {
  const squashes = new Map<string, string>()
  for (const { commit, dir, split, mainline } of commits) {
    const squash = dir.length > 0 && split.length > 0 && mainline.length === 0 && !firstParent.has(commit)
    if (squash && !squashes.has(dir)) squashes.set(dir, commit)
  }
  return squashes
}

const trailerCommits = async (): Promise<readonly TrailerCommit[]> => {
  const trailer = (key: string) => `%(trailers:key=${key},valueonly,separator=%x2C)`
  const format = ['%H', trailer('git-subtree-dir'), trailer('git-subtree-split'), trailer('git-subtree-mainline')]
    .join('%x1f') + '%x1e'
  const out = await git(['log', '--topo-order', `--format=${format}`, 'HEAD'])
  return out.split(RECORD).flatMap((record) => {
    const [commit = '', dir = '', split = '', mainline = ''] = record.trim().split(FIELD).map((field) => field.trim())
    return commit.length > 0 ? [{ commit, dir: dir.replace(/\/+$/, ''), split, mainline }] : []
  })
}

const treeAt = async (rev: string): Promise<string | null> => {
  try {
    return (await git(['rev-parse', '--verify', '--quiet', rev])).trim()
  } catch {
    return null
  }
}

export const checkSubtrees = async (): Promise<Verdict> => {
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Undecided(
      'the history is shallow, so the squash commits are out of reach; fetch the commit graph first: git fetch --filter=tree:0 --unshallow',
    )
  }
  const firstParent = new Set((await git(['rev-list', '--first-parent', 'HEAD'])).split('\n').filter(Boolean))
  const squashes = latestSquashes(await trailerCommits(), firstParent)
  const violations: string[] = []
  let present = 0
  for (const [dir, squash] of [...squashes].sort(([a], [b]) => a.localeCompare(b))) {
    const head = await treeAt(`HEAD:${dir}`)
    if (head === null) continue
    present++
    const vendored = (await git(['rev-parse', `${squash}^{tree}`])).trim()
    if (head === vendored) continue
    const changed = (await git(['diff', '--name-status', vendored, head])).trim().split('\n')
    violations.push(
      `${dir}: differs from squash ${squash.slice(0, 12)} in ${changed.length} path(s)`,
      ...changed.slice(0, 10).map((line) => `  ${line}`),
    )
  }
  return violations.length === 0
    ? holds(`${present} subtree(s) match the squash commit that vendored them`)
    : violated(
      violations,
      'A vendored subtree changes only through `git subtree pull --squash`. Make the change upstream and pull it.',
    )
}
