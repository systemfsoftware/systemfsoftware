// A mutation baseline may only shrink once it has been seeded. Every package's
// mutation-baseline.json names the surviving mutants `stryker gate --baseline`
// tolerates, and its mutation-baseline.reasons.md gives each id one row: under
// `## Justified` a reason no test can tell the mutant apart, under `## Debt` a
// reason starting `debt:` for survivors seeded unjudged. The seed manifest
// scripts/tools/repo-checks/mutation-debt-seed.json records, per workspace
// package name, every id that was seeded as debt. From the commit that first
// carries the manifest onward, a package's debt must already be in its seed
// entry, the manifest may not gain a package or an id, and a seeded id that is
// still in the baseline must stay debt - so stripping `debt:` or re-listing the
// id as justified is refused, and debt is cleared only by dropping the id from
// the baseline. A package whose baseline was deleted while the manifest still
// seeds it is refused, and an id may leave a seed entry only together with the
// baseline, so it cannot be dropped from the manifest and re-listed as
// justified. The one exemption is a merge-base with no manifest file at all:
// that commit is the seeding.
import { relative } from '@std/path'
import { git, holds, objectAt, parseJsonObject, Undecided, type Verdict, violated } from './verdict.ts'
import { readWorkspace, workspacePackageDirs } from './workspace.ts'

export type Kind = 'justified' | 'debt'

export const MANIFEST_PATH = 'scripts/tools/repo-checks/mutation-debt-seed.json'

/** The gate's Baseline schema: schemaVersion literal 1, survivors of 16-hex mutant ids. */
const SCHEMA_VERSION = 1
const MUTANT_ID = /^[0-9a-f]{16}$/

export interface Row {
  readonly kind: Kind
  readonly reason: string
  readonly section: Kind | null
  readonly line: number
}

export interface Reasons {
  readonly rows: ReadonlyMap<string, Row>
  readonly duplicates: readonly { readonly id: string; readonly lines: readonly number[] }[]
  readonly unknownHeadings: readonly { readonly heading: string; readonly line: number }[]
  readonly malformed: readonly number[]
}

export interface Baseline {
  readonly ids: ReadonlySet<string>
  readonly reasons: Reasons
  readonly rejection: string | null
}

const EMPTY_REASONS: Reasons = { rows: new Map(), duplicates: [], unknownHeadings: [], malformed: [] }

/** Splits a markdown table row on its unescaped pipes, unescaping `\|` inside a cell. */
const cellsOf = (line: string): readonly string[] => {
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (char === '\\' && line[i + 1] === '|') {
      cell += '|'
      i++
      continue
    }
    if (char === '|') {
      cells.push(cell)
      cell = ''
      continue
    }
    cell += char
  }
  cells.push(cell)
  if (cells.length > 0 && cells[0]!.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === '') cells.pop()
  return cells
}

/** Parses the reasons file: each id row's kind comes from its reason text; a row outside its section is misplaced. */
export const parseReasons = (text: string): Reasons => {
  const rows = new Map<string, Row>()
  const lines = new Map<string, number[]>()
  const unknownHeadings: { heading: string; line: number }[] = []
  const malformed: number[] = []
  let section: Kind | null = null
  for (const [index, line] of text.split('\n').entries()) {
    const heading = /^##\s+(.*?)\s*$/.exec(line)
    if (heading !== null) {
      const name = heading[1]!
      if (name === 'Justified') section = 'justified'
      else if (name === 'Debt') section = 'debt'
      else {
        section = null
        unknownHeadings.push({ heading: name, line: index + 1 })
      }
      continue
    }
    if (!line.trimStart().startsWith('|')) continue
    const cells = cellsOf(line)
    const idCell = /^`([0-9a-f]{16})`$/.exec((cells[0] ?? '').trim())
    if (idCell === null) continue
    if (cells.length !== 4) {
      malformed.push(index + 1)
      continue
    }
    const id = idCell[1]!
    const reason = cells[3]!.trim()
    const known = lines.get(id)
    if (known !== undefined) {
      known.push(index + 1)
      continue
    }
    lines.set(id, [index + 1])
    rows.set(id, { kind: reason.startsWith('debt:') ? 'debt' : 'justified', reason, section, line: index + 1 })
  }
  const duplicates = [...lines]
    .filter(([, numbered]) => numbered.length > 1)
    .map(([id, numbered]) => ({ id, lines: numbered }))
  return { rows, duplicates, unknownHeadings, malformed }
}

const rejected = (why: string): Baseline => ({ ids: new Set(), reasons: EMPTY_REASONS, rejection: why })

export const parseBaseline = (json: string, label: string): Baseline => {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (cause) {
    return rejected(`${label}: unparseable JSON - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return rejected(`${label}: not a JSON object`)
  }
  const record = value as Record<string, unknown>
  if (record['schemaVersion'] !== SCHEMA_VERSION) {
    return rejected(
      `${label}: schemaVersion ${JSON.stringify(record['schemaVersion'])}; stryker gate reads only ${SCHEMA_VERSION}`,
    )
  }
  const survivors = record['survivors']
  if (!Array.isArray(survivors)) return rejected(`${label}: no \`survivors\` array`)
  for (const id of survivors) {
    if (typeof id !== 'string' || !MUTANT_ID.test(id)) {
      return rejected(`${label}: survivor ${JSON.stringify(id)} is not a 16-character lowercase hexadecimal mutant id`)
    }
  }
  return { ids: new Set(survivors as string[]), reasons: EMPTY_REASONS, rejection: null }
}

export const baselineOf = (json: string, reasons: string | null, label = 'mutation-baseline.json'): Baseline => {
  const parsed = parseBaseline(json, label)
  if (parsed.rejection !== null) return parsed
  return { ...parsed, reasons: reasons === null ? EMPTY_REASONS : parseReasons(reasons) }
}

export interface JudgeInput {
  readonly dir: string
  readonly pkg: string
  readonly head: Baseline
  /** The package's ids in the head seed manifest; empty when it has no entry. */
  readonly seed: readonly string[]
  /** The package's ids in the merge-base manifest; null when that commit has no manifest file (the seeding). */
  readonly baseSeed: readonly string[] | null
}

export interface Judgment {
  readonly violations: readonly string[]
  readonly warnings: readonly string[]
}

/** Violations and warnings for one package: baseSeed null means the merge-base carries no manifest, so only row rules apply. */
export const judgeBaseline = ({ dir, pkg, head, seed, baseSeed }: JudgeInput): Judgment => {
  const reasons = `${dir}/mutation-baseline.reasons.md`
  const violations: string[] = []
  const warnings: string[] = []
  if (head.rejection !== null) {
    violations.push(
      `BASELINE_REJECTED ${dir}: ${head.rejection}; \`stryker gate\` must be able to decode mutation-baseline.json.`,
    )
  }
  for (const { heading, line } of head.reasons.unknownHeadings) {
    violations.push(
      `BASELINE_REASON_HEADING ${dir}:${line}: \`## ${heading}\` is not a reasons section; use exactly \`## Justified\` or \`## Debt\`.`,
    )
  }
  for (const line of head.reasons.malformed) {
    violations.push(
      `BASELINE_REASON_MALFORMED ${dir}:${line}: a row is \`| \\\`id\\\` | file:line | mutator -> replacement | reason |\` with exactly four columns; escape a pipe inside a cell as \\\`\\|\\\`, or it is read as a column.`,
    )
  }
  for (const { id, lines } of head.reasons.duplicates) {
    violations.push(
      `BASELINE_REASON_DUPLICATE ${dir} ${id}: listed at ${
        lines.map((line) => `${reasons}:${line}`).join(', ')
      }; keep exactly one row - a seeded id cannot be re-listed under another section.`,
    )
  }
  for (const id of [...head.ids].sort()) {
    const row = head.reasons.rows.get(id)
    if (row === undefined) {
      violations.push(
        `BASELINE_REASON_MISSING ${dir} ${id}: add one row to ${reasons} saying why no test can tell this mutant apart, or kill it with a test and drop the id from the baseline.`,
      )
      continue
    }
    if (row.reason.trim() === '') {
      violations.push(
        `BASELINE_REASON_MISSING ${dir} ${id}: the row at ${reasons}:${row.line} has an empty reason; state why no test can tell this mutant apart.`,
      )
      continue
    }
    if (row.section !== row.kind) {
      violations.push(
        `BASELINE_REASON_MISPLACED ${dir} ${id}: put \`debt:\` reasons under \`## Debt\` and every other reason under \`## Justified\`.`,
      )
    }
  }
  for (const id of [...head.reasons.rows.keys()].sort()) {
    if (!head.ids.has(id)) {
      warnings.push(
        `BASELINE_REASON_ORPHAN ${dir} ${id}: delete its row from ${reasons}; the baseline no longer lists it.`,
      )
    }
  }
  if (baseSeed !== null) {
    const seeded = new Set(seed)
    const baseSeeded = new Set(baseSeed)
    const debt = new Set(
      [...head.reasons.rows].filter(([id, row]) => head.ids.has(id) && row.kind === 'debt').map(([id]) => id),
    )
    for (const id of [...seeded].sort()) {
      if (!baseSeeded.has(id)) {
        violations.push(
          `BASELINE_MANIFEST_GREW ${pkg} ${id}: the seed manifest ${MANIFEST_PATH} may only shrink; debt is seeded once.`,
        )
      }
    }
    for (const id of [...baseSeeded].sort()) {
      if (!seeded.has(id) && head.ids.has(id)) {
        violations.push(
          `BASELINE_SEED_DROPPED_KEPT ${dir} ${id}: this id left this package's seed entry in ${MANIFEST_PATH} but is still in mutation-baseline.json; an id may leave the seed entry only together with the baseline, so drop it from both, or keep it seeded as debt.`,
        )
      }
    }
    for (const id of [...debt].sort()) {
      if (seeded.has(id) || baseSeeded.has(id)) continue
      violations.push(
        `BASELINE_DEBT_ADDED ${dir} ${id}: debt is seeded once; kill this mutant with a test, or give it a \`## Justified\` reason why no test can tell it apart.`,
      )
    }
    for (const id of [...seeded].sort()) {
      if (head.ids.has(id) && !debt.has(id)) {
        violations.push(
          `BASELINE_DEBT_LAUNDERED ${dir} ${id}: seeded debt must stay under \`## Debt\` with a \`debt:\` reason; clear it by dropping the id from the baseline, not by relabelling the row.`,
        )
      }
    }
  }
  return { violations, warnings }
}

const showAt = async (rev: string, path: string): Promise<string | null> =>
  (await objectAt(rev, path))?.type === 'blob' ? await git(['show', `${rev}:${path}`]) : null

const packageName = (json: string, label: string): string => {
  const name = parseJsonObject(json, label)['name']
  if (typeof name !== 'string' || name.length === 0) throw new Undecided(`${label}: no package \`name\``)
  return name
}

interface Manifest {
  readonly packages: ReadonlyMap<string, readonly string[]>
}

const parseManifest = (json: string, label: string): Manifest => {
  const record = parseJsonObject(json, label)
  const packages = record['packages']
  if (typeof packages !== 'object' || packages === null || Array.isArray(packages)) {
    throw new Undecided(`${label}: no \`packages\` object`)
  }
  const out = new Map<string, readonly string[]>()
  for (const [name, ids] of Object.entries(packages)) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && MUTANT_ID.test(id))) {
      throw new Undecided(`${label}: packages.${name} is not an array of 16-hex mutant ids`)
    }
    out.set(name, ids as string[])
  }
  return { packages: out }
}

const manifestAt = async (rev: string): Promise<Manifest | null> => {
  const json = await showAt(rev, MANIFEST_PATH)
  return json === null ? null : parseManifest(json, `${rev}:${MANIFEST_PATH}`)
}

export const checkMutationBaseline = async (base: string | undefined, head: string): Promise<Verdict> => {
  if (base === undefined) throw new Undecided('mutation-baseline needs --base <rev>')
  const mergeBase = (await git(['merge-base', base, head])).trim()
  const headManifest = await manifestAt(head)
  if (headManifest === null) throw new Undecided(`no seed manifest at ${head}:${MANIFEST_PATH}`)
  const baseManifest = await manifestAt(mergeBase)
  const root = Deno.cwd()
  const dirs = await workspacePackageDirs(root, await readWorkspace(root))
  const violations: string[] = []
  const warnings: string[] = []
  let judged = 0
  if (baseManifest !== null) {
    for (const name of [...headManifest.packages.keys()].sort()) {
      if (!baseManifest.packages.has(name)) {
        violations.push(
          `BASELINE_MANIFEST_GREW ${name}: the seed manifest ${MANIFEST_PATH} may only shrink; debt is seeded once.`,
        )
      }
    }
  }
  // Judge every package that has a seed entry or a baseline on either side: a
  // package whose baseline was deleted must not drop its seeded debt, and a
  // package with no baseline at head must not gain a seed id.
  interface Candidate {
    readonly name: string
    readonly dir: string | null
    readonly headBaseline: Baseline | null
  }
  const packages = new Map<string, Candidate>()
  const remember = (name: string): void => {
    if (!packages.has(name)) packages.set(name, { name, dir: null, headBaseline: null })
  }
  for (const dir of dirs) {
    const rel = relative(root, dir)
    const json = await showAt(head, `${rel}/mutation-baseline.json`)
    if (json === null) continue
    const name = packageName((await showAt(head, `${rel}/package.json`)) ?? '{}', `${rel}/package.json`)
    packages.set(name, {
      name,
      dir: rel,
      headBaseline: baselineOf(json, await showAt(head, `${rel}/mutation-baseline.reasons.md`)),
    })
  }
  for (const name of headManifest.packages.keys()) remember(name)
  if (baseManifest !== null) {
    for (const name of baseManifest.packages.keys()) remember(name)
  }
  for (const { name, dir, headBaseline } of packages.values()) {
    const seed = headManifest.packages.get(name) ?? []
    const baseSeed = baseManifest === null ? null : (baseManifest.packages.get(name) ?? [])
    if (headBaseline === null) {
      if (seed.length > 0) {
        violations.push(
          `BASELINE_MISSING_FOR_SEEDED_DEBT ${name}: the seed manifest ${MANIFEST_PATH} still lists debt ${
            [...seed].sort().join(', ')
          } for this package, but it has no mutation-baseline.json at ${head}; keep the baseline that seeds it, or clear the seed entry in the same change.`,
        )
      }
      if (baseSeed !== null) {
        const baseSeeded = new Set(baseSeed)
        for (const id of [...seed].sort()) {
          if (!baseSeeded.has(id)) {
            violations.push(
              `BASELINE_MANIFEST_GREW ${name} ${id}: the seed manifest ${MANIFEST_PATH} may only shrink; debt is seeded once.`,
            )
          }
        }
      }
      continue
    }
    const judgment = judgeBaseline({ dir: dir ?? name, pkg: name, head: headBaseline, seed, baseSeed })
    violations.push(...judgment.violations)
    warnings.push(...judgment.warnings)
    judged++
  }
  for (const warning of warnings) console.warn(`repo-checks mutation-baseline: warning - ${warning}`)
  return violations.length === 0
    ? holds(
      `${judged} package baseline(s) hold: one reason row per id, and debt only shrinks${
        baseManifest === null ? ' (seeding - the merge-base has no manifest)' : ''
      }`,
    )
    : violated(
      violations,
      'A mutation baseline may only shrink: every id needs one reason row, and debt seeded unjudged stays debt until the id leaves the baseline.',
    )
}
