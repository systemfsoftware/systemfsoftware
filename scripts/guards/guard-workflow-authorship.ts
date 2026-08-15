#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,./bin/dprint
/**
 * The authorship gate for the `workflow` role.
 *
 * A type can decide almost everything about a cell, but it cannot decide "this file was
 * generated". That is the one presence check the brief permits to survive, and this is it:
 * every `*.workflow.ts` under a package's `src/` must have a sibling declaration, and
 * re-emitting that declaration must reproduce the file on disk byte for byte.
 *
 * Without this gate the workflow rules are unreachable only by discipline, which is not a
 * property of the tree. With it, a hand-authored or hand-edited workflow cell fails the
 * check chain, and the rules whose violations the declaration cannot express become
 * genuinely unreachable rather than merely unreached.
 */
import { emitWorkflow, parseWorkflow } from '../tools/workflow-emit.ts'

const CELL_SUFFIX = '.workflow.ts'
const DECL_SUFFIX = '.workflow.decl.json'

/**
 * Files the taxonomy places outside the cell population: tests, fixtures and the
 * transient probes a violation prober writes and deletes.
 */
const OUTSIDE_POPULATION = ['/__tests__/', '/fixtures/', '/test/', 'falsify-probe.', 'exhaustive-probe.']

type Evidence = {
  /** Tracked cell paths inside the population. */
  readonly cells: readonly string[]
  /** Tracked declaration paths. */
  readonly declarations: readonly string[]
  /** Declaration path -> the bytes emitting it produces, already formatted. */
  readonly emitted: Readonly<Record<string, string>>
  /** Cell path -> the bytes on disk. */
  readonly onDisk: Readonly<Record<string, string>>
}

type Verdict = {
  /** Cells with no declaration beside them: hand-authored, so the rules must stay. */
  readonly undeclared: string[]
  /** Declarations naming no cell: an emission nothing consumes. */
  readonly orphaned: string[]
  /** Cells whose bytes differ from their declaration's emission. */
  readonly drifted: string[]
}

export const cellOf = (declaration: string): string => `${declaration.slice(0, -DECL_SUFFIX.length)}${CELL_SUFFIX}`

export const declarationOf = (cell: string): string => `${cell.slice(0, -CELL_SUFFIX.length)}${DECL_SUFFIX}`

export const inPopulation = (path: string): boolean =>
  path.endsWith(CELL_SUFFIX) &&
  path.includes('/src/') &&
  !OUTSIDE_POPULATION.some((fragment) => path.includes(fragment))

export const verdict = (evidence: Evidence): Verdict => {
  const declared = new Set(evidence.declarations)
  const cells = new Set(evidence.cells)
  return {
    undeclared: evidence.cells.filter((cell) => !declared.has(declarationOf(cell))).sort(),
    orphaned: evidence.declarations.filter((decl) => !cells.has(cellOf(decl))).sort(),
    drifted: evidence.declarations
      .filter((decl) => {
        const cell = cellOf(decl)
        if (!cells.has(cell)) return false
        return evidence.emitted[decl] !== evidence.onDisk[cell]
      })
      .sort(),
  }
}

const dec = new TextDecoder()

const run = async (cmd: readonly string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(cmd[0]!, {
    args: cmd.slice(1),
    stdin: 'null',
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code, out: dec.decode(stdout) }
}

/**
 * The emission is compared after the repository's own formatter, because `dprint` owns the
 * committed bytes and the emitter is not a formatter. A mismatch is then a difference in
 * content, never in layout.
 *
 * Formatting goes through a temp file beside the cell rather than `--stdin`: `bin/dprint`
 * execs from inside a `while read` loop, so the tool inherits the loop's stdin instead of the
 * caller's, and `pnpm exec` writes its own banner onto stdout. Either would be spliced into
 * the emission. The file is placed beside the cell so dprint's config selects it the same way
 * it selects the cell, and it is removed even when formatting throws.
 */
const formatted = async (source: string, cell: string): Promise<string> => {
  const probe = `${cell.slice(0, -CELL_SUFFIX.length)}.authorship-probe.workflow.ts`
  await Deno.writeTextFile(probe, source)
  try {
    const { code } = await run(['./bin/dprint', 'fmt', probe])
    if (code !== 0) throw new Error(`dprint failed formatting the emission for ${cell}`)
    return await Deno.readTextFile(probe)
  } finally {
    await Deno.remove(probe).catch(() => {})
  }
}

const gather = async (): Promise<Evidence> => {
  const { code, out } = await run(['git', 'ls-files'])
  if (code !== 0) throw new Error('git ls-files failed')
  const tracked = out.split('\n').filter(Boolean)
  const cells = tracked.filter(inPopulation)
  const declarations = tracked.filter((path) => path.endsWith(DECL_SUFFIX))

  const emitted: Record<string, string> = {}
  for (const decl of declarations) {
    const raw: unknown = JSON.parse(await Deno.readTextFile(decl))
    emitted[decl] = await formatted(emitWorkflow(parseWorkflow(raw)), cellOf(decl))
  }
  const onDisk: Record<string, string> = {}
  for (const cell of cells) onDisk[cell] = await Deno.readTextFile(cell)

  return { cells, declarations, emitted, onDisk }
}

const main = async (): Promise<number> => {
  const evidence = await gather()
  const result = verdict(evidence)

  for (const cell of result.undeclared) {
    console.error(
      `::error file=${cell}::hand-authored workflow cell. Every ${CELL_SUFFIX} is emitted: write ` +
        `${declarationOf(cell)} and regenerate with \`deno run scripts/tools/workflow-emit.ts <decl> <out>\`.`,
    )
  }
  for (const decl of result.orphaned) {
    console.error(`::error file=${decl}::declaration emits nothing - ${cellOf(decl)} does not exist.`)
  }
  for (const decl of result.drifted) {
    console.error(
      `::error file=${cellOf(decl)}::hand-edited since emission. Re-emit from ${decl}; edit the ` +
        `declaration, never the cell.`,
    )
  }

  const failures = result.undeclared.length + result.orphaned.length + result.drifted.length
  if (failures > 0) {
    console.error(`guard-workflow-authorship: ${failures} failure(s) across ${evidence.cells.length} cell(s)`)
    return 1
  }
  console.log(
    `guard-workflow-authorship: ${evidence.cells.length} cell(s) emitted and round-trip clean, ` +
      `${evidence.declarations.length} declaration(s)`,
  )
  return 0
}

const FIXTURES: readonly { label: string; evidence: Evidence; expect: Verdict }[] = [
  {
    label: 'a cell with a matching declaration passes',
    evidence: {
      cells: ['p/src/a.workflow.ts'],
      declarations: ['p/src/a.workflow.decl.json'],
      emitted: { 'p/src/a.workflow.decl.json': 'export const a = 1\n' },
      onDisk: { 'p/src/a.workflow.ts': 'export const a = 1\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: [] },
  },
  {
    label: 'a hand-authored cell is undeclared',
    evidence: {
      cells: ['p/src/a.workflow.ts'],
      declarations: [],
      emitted: {},
      onDisk: { 'p/src/a.workflow.ts': 'export const a = 1\n' },
    },
    expect: { undeclared: ['p/src/a.workflow.ts'], orphaned: [], drifted: [] },
  },
  {
    label: 'a hand-edited cell drifts from its declaration',
    evidence: {
      cells: ['p/src/a.workflow.ts'],
      declarations: ['p/src/a.workflow.decl.json'],
      emitted: { 'p/src/a.workflow.decl.json': 'export const a = 1\n' },
      onDisk: { 'p/src/a.workflow.ts': 'export const a = 2\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: ['p/src/a.workflow.decl.json'] },
  },
  {
    label: 'a declaration whose cell was deleted is orphaned, and not also drifted',
    evidence: {
      cells: [],
      declarations: ['p/src/a.workflow.decl.json'],
      emitted: { 'p/src/a.workflow.decl.json': 'export const a = 1\n' },
      onDisk: {},
    },
    expect: { undeclared: [], orphaned: ['p/src/a.workflow.decl.json'], drifted: [] },
  },
  {
    label: 'every failure kind is reported at once rather than the first',
    evidence: {
      cells: ['p/src/a.workflow.ts', 'p/src/b.workflow.ts'],
      declarations: ['p/src/b.workflow.decl.json', 'p/src/c.workflow.decl.json'],
      emitted: {
        'p/src/b.workflow.decl.json': 'export const b = 1\n',
        'p/src/c.workflow.decl.json': 'export const c = 1\n',
      },
      onDisk: { 'p/src/a.workflow.ts': 'x', 'p/src/b.workflow.ts': 'export const b = 2\n' },
    },
    expect: {
      undeclared: ['p/src/a.workflow.ts'],
      orphaned: ['p/src/c.workflow.decl.json'],
      drifted: ['p/src/b.workflow.decl.json'],
    },
  },
]

const POPULATION_FIXTURES: readonly { path: string; expect: boolean }[] = [
  { path: 'packages/p/src/a.workflow.ts', expect: true },
  { path: 'packages/p/src/internal/a.workflow.ts', expect: true },
  { path: 'packages/p/src/__tests__/a.workflow.ts', expect: false },
  { path: 'packages/p/src/fixtures/a.workflow.ts', expect: false },
  { path: 'packages/p/src/internal/falsify-probe.workflow.ts', expect: false },
  { path: 'packages/p/src/a.kernel.ts', expect: false },
  { path: 'docs/plans/a.workflow.ts', expect: false },
]

const selftest = (): number => {
  const failures = [
    ...FIXTURES.flatMap(({ label, evidence, expect }) => {
      const got = verdict(evidence)
      return JSON.stringify(got) === JSON.stringify(expect)
        ? []
        : [`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`]
    }),
    ...POPULATION_FIXTURES.flatMap(({ path, expect }) =>
      inPopulation(path) === expect ? [] : [`  inPopulation(${path}) expected ${expect}`]
    ),
  ]
  const total = FIXTURES.length + POPULATION_FIXTURES.length
  if (failures.length > 0) {
    console.error(`guard-workflow-authorship: selftest FAILED (${failures.length}/${total})\n`)
    for (const failure of failures) console.error(failure)
    return 1
  }
  console.log(`guard-workflow-authorship: selftest ok (${total} fixtures)`)
  return 0
}

if (import.meta.main) {
  try {
    Deno.exitCode = Deno.args.includes('--selftest') ? selftest() : await main()
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
    Deno.exitCode = 1
  }
}
