// A change adds at most one plan: at most one file enters the declared plan
// directory between merge-base(base, head) and head (HEAD by default), counting
// additions and renames from outside it. The directory is the caller's
// declaration, so the check carries no path of its own; one that is not a
// directory at head is undecided, never an empty pass.
// Git prints repository paths with `/` on every platform.
import { isAbsolute } from '@std/path'
import { git, holds, objectAt, Undecided, type Verdict, violated } from './verdict.ts'

export interface Change {
  readonly status: string
  readonly from: string | null
  readonly to: string
}

/** Parses `git diff --name-status -z`: status, then one path, or two for a rename. */
export const parseNameStatus = (out: string): readonly Change[] => {
  const fields = out.split('\0')
  const changes: Change[] = []
  for (let i = 0; i + 1 < fields.length;) {
    const status = fields[i] ?? ''
    if (status.length === 0) break
    const renamed = status.startsWith('R')
    changes.push(
      renamed
        ? { status, from: fields[i + 1] ?? '', to: fields[i + 2] ?? '' }
        : { status, from: null, to: fields[i + 1] ?? '' },
    )
    i += renamed ? 3 : 2
  }
  return changes
}

const segments = (path: string): readonly string[] => path.split('/').filter((part) => part.length > 0 && part !== '.')

const inside = (dir: string, path: string): boolean => {
  const parts = segments(path)
  const prefix = segments(dir)
  return parts.length > prefix.length && prefix.every((part, i) => parts[i] === part)
}

export const addedPlans = (changes: readonly Change[], dir: string): readonly string[] =>
  changes.flatMap(({ status, from, to }) => {
    const enters = status.startsWith('A') || (status.startsWith('R') && !inside(dir, from ?? ''))
    return enters && inside(dir, to) ? [to] : []
  })

export const judgeSinglePlan = (added: readonly string[], dir: string): Verdict =>
  added.length <= 1
    ? holds(`${added.length} plan(s) added under ${dir}`)
    : violated(
      added.map((path) => `added: ${path}`),
      `A change introduces at most one plan under ${dir}; fold the others into one plan.`,
    )

export const checkSinglePlan = async (
  dir: string | undefined,
  base: string | undefined,
  head: string,
): Promise<Verdict> => {
  if (dir === undefined || base === undefined) {
    throw new Undecided('single-plan needs --plans <dir> and --base <rev>')
  }
  if (isAbsolute(dir) || (await objectAt(head, segments(dir).join('/')))?.type !== 'tree') {
    throw new Undecided(`--plans ${dir} is not a repository-relative directory at ${head}`)
  }
  const mergeBase = (await git(['merge-base', base, head])).trim()
  const changes = parseNameStatus(await git(['diff', '--name-status', '-z', '--find-renames', mergeBase, head]))
  return judgeSinglePlan(addedPlans(changes, dir), dir)
}
