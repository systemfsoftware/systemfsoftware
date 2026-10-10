// A mutation baseline may only shrink. Every package's mutation-baseline.json
// names the surviving mutants `stryker gate --baseline` tolerates, and its
// mutation-baseline.reasons.md gives each id one row: under `## Justified` a
// reason no test can tell the mutant apart, under `## Debt` a reason starting
// `debt:` for survivors seeded unjudged. Between merge-base(base, head) and
// head, a baseline that already exists at the merge-base may lose ids and may
// gain ids with a justified reason, but its debt may not grow. A baseline the
// merge-base does not have is its seeding commit: only the row rules apply.
import { git, holds, objectAt, Undecided, type Verdict, violated } from './verdict.ts'

export type Kind = 'justified' | 'debt'

export interface Baseline {
  readonly ids: ReadonlySet<string>
  readonly reasons: ReadonlyMap<string, Kind>
  readonly misplaced: readonly string[]
}

const ROW = /^\|\s*`([0-9a-f]{16})`\s*\|.*\|\s*([^|]*?)\s*\|\s*$/
const SECTION = /^##\s+(Justified|Debt)\s*$/

/** Parses the reasons file: each id row's kind comes from its reason text; a row under the other section is misplaced. */
export const parseReasons = (text: string): Pick<Baseline, 'reasons' | 'misplaced'> => {
  const reasons = new Map<string, Kind>()
  const misplaced: string[] = []
  let section: Kind | null = null
  for (const line of text.split('\n')) {
    const heading = SECTION.exec(line)
    if (heading !== null) {
      section = heading[1] === 'Debt' ? 'debt' : 'justified'
      continue
    }
    const row = ROW.exec(line)
    if (row === null) continue
    const id = row[1]!
    const kind: Kind = row[2]!.startsWith('debt:') ? 'debt' : 'justified'
    if (section !== kind) misplaced.push(id)
    reasons.set(id, kind)
  }
  return { reasons, misplaced }
}

export const parseBaseline = (json: string, label: string): ReadonlySet<string> => {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (cause) {
    throw new Undecided(`${label}: unparseable JSON - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const survivors = (value as { survivors?: unknown } | null)?.survivors
  if (!Array.isArray(survivors) || !survivors.every((id) => typeof id === 'string')) {
    throw new Undecided(`${label}: no string array \`survivors\``)
  }
  return new Set(survivors)
}

export const baselineOf = (json: string, reasons: string | null, label: string): Baseline => ({
  ids: parseBaseline(json, label),
  ...(reasons === null ? { reasons: new Map(), misplaced: [] } : parseReasons(reasons)),
})

const debtOf = (baseline: Baseline): ReadonlySet<string> =>
  new Set([...baseline.reasons].filter(([, kind]) => kind === 'debt').map(([id]) => id))

/** Violations for one package directory: `base` is null when the merge-base has no baseline there (the seeding commit). */
export const judgeBaseline = (dir: string, base: Baseline | null, head: Baseline): readonly string[] => {
  const reasons = `${dir}/mutation-baseline.reasons.md`
  const out: string[] = []
  for (const id of head.ids) {
    if (!head.reasons.has(id)) {
      out.push(
        `BASELINE_REASON_MISSING ${dir} ${id}: add a \`## Justified\` row to ${reasons} saying why no test can tell this mutant apart, or kill it with a test and drop the id.`,
      )
    }
  }
  for (const id of head.reasons.keys()) {
    if (!head.ids.has(id)) {
      out.push(`BASELINE_REASON_ORPHAN ${dir} ${id}: delete its row from ${reasons}; the baseline no longer lists it.`)
    }
  }
  for (const id of head.misplaced) {
    out.push(
      `BASELINE_REASON_MISPLACED ${dir} ${id}: move the row so \`debt:\` reasons sit under \`## Debt\` and every other reason under \`## Justified\`.`,
    )
  }
  if (base !== null) {
    const before = debtOf(base)
    for (const id of debtOf(head)) {
      if (!before.has(id)) {
        out.push(
          `BASELINE_DEBT_ADDED ${dir} ${id}: debt is seeded once; kill this mutant with a test, or give it a \`## Justified\` reason why no test can tell it apart.`,
        )
      }
    }
  }
  return out
}

const showAt = async (rev: string, path: string): Promise<string | null> =>
  (await objectAt(rev, path))?.type === 'blob' ? await git(['show', `${rev}:${path}`]) : null

const baselineAt = async (rev: string, dir: string): Promise<Baseline | null> => {
  const json = await showAt(rev, `${dir}/mutation-baseline.json`)
  return json === null
    ? null
    : baselineOf(json, await showAt(rev, `${dir}/mutation-baseline.reasons.md`), `${rev}:${dir}`)
}

const BASELINE_FILES = /(^|\/)mutation-baseline(\.reasons\.md|\.json)$/

export const checkMutationBaseline = async (base: string | undefined, head: string): Promise<Verdict> => {
  if (base === undefined) throw new Undecided('mutation-baseline needs --base <rev>')
  const mergeBase = (await git(['merge-base', base, head])).trim()
  const changed = (await git(['diff', '--name-only', '-z', '--no-renames', mergeBase, head])).split('\0')
  const dirs = [
    ...new Set(changed.filter((path) => BASELINE_FILES.test(path)).map((path) => path.replace(BASELINE_FILES, ''))),
  ]
  const violations: string[] = []
  for (const dir of dirs.sort()) {
    const after = await baselineAt(head, dir)
    if (after === null) continue
    violations.push(...judgeBaseline(dir, await baselineAt(mergeBase, dir), after))
  }
  return violations.length === 0
    ? holds(`${dirs.length} changed baseline(s) only shrink or gain justified ids`)
    : violated(
      violations,
      'A mutation baseline may only shrink: every id needs one reason row, and debt is seeded once (when the merge-base has no baseline for the package).',
    )
}
