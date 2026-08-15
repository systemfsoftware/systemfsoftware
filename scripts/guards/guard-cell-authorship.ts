#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,./bin/dprint
/**
 * The authorship gate.
 *
 * A type can decide almost everything about a cell, but it cannot decide "this file was
 * generated". That is the one presence check the brief permits to survive, and this is it: a
 * cell with a declaration beside it must be that declaration's emission, byte for byte.
 *
 * Two guarantees, deliberately separate, because conflating them would let a partly-migrated
 * role borrow the completed one's authority:
 *
 * - **Fidelity**, for every declaration of any role with an emitter: the cell on disk is what
 *   emitting the declaration produces. A hand-edited generated cell fails here.
 * - **Completeness**, only for a role named in `COMPLETE_ROLES`: every cell of that role has a
 *   declaration. A hand-authored cell fails here.
 *
 * Deleting a rule because "the declaration cannot express its violation" is licensed only by
 * completeness, and only for that rule's role. A role is added to `COMPLETE_ROLES` when its
 * last cell is emitted, never before - an entry added early is the whole gate lying.
 */
import { emitExecutor, parseExecutor } from '../tools/executor-emit.ts'
import { emitSchema, parseSchema } from '../tools/schema-emit.ts'
import { emitShape, parseShape } from '../tools/shape-emit.ts'
import { compileProgram, loadProgram } from '../tools/term-compile.ts'
import { emitWorkflow, parseWorkflow } from '../tools/workflow-emit.ts'

type Emitter = (declaration: unknown) => string

/**
 * The roles a data-description emitter covers. A `.decl.json` is only meaningful for one of these,
 * because a data description's vocabulary *is* the role's vocabulary — a schema cell's constructs
 * are Schema's, and there is no such vocabulary for a role whose cells compute.
 */
const EMITTERS: Readonly<Record<string, Emitter>> = {
  workflow: (raw) => emitWorkflow(parseWorkflow(raw)),
  executor: (raw) => emitExecutor(parseExecutor(raw)),
  schema: (raw) => emitSchema(parseSchema(raw)),
  shape: (raw) => emitShape(parseShape(raw)),
}

/**
 * Every sanctioned role, which is what a cell may be and what a term may compile to.
 *
 * A term is a program and programs do not come in roles, so one compiler serves all of them. The
 * role is a *type* at the authoring site — `kernel()` in `scripts/tools/cell.ts` admits only terms
 * requiring nothing — and by the time the compiler runs, that obligation is already discharged.
 * It survives in the filename because the cell's consumers read the suffix.
 */
const ROLES: readonly string[] = [
  'acl',
  'adapter',
  'executor',
  'handler',
  'kernel',
  'middleware',
  'observer',
  'policy',
  'schema',
  'shape',
  'state',
  'store',
  'workflow',
]

/**
 * Roles with no hand-authored cell left. Only these carry the completeness guarantee, and
 * only these license a deletion.
 */
const COMPLETE_ROLES: readonly string[] = ['workflow']

/**
 * Files the taxonomy places outside the cell population: tests, fixtures and the transient
 * probes a violation prober writes and deletes.
 */
const OUTSIDE_POPULATION = [
  '/__tests__/',
  '/fixtures/',
  '/test/',
  'falsify-probe.',
  'exhaustive-probe.',
  'emitprobe.',
  'authorship-probe.',
]

type Evidence = {
  /** Tracked cell paths inside the population, any role with an emitter. */
  readonly cells: readonly string[]
  /** Tracked declaration paths. */
  readonly declarations: readonly string[]
  /** Declaration path -> the bytes emitting it produces, already formatted. */
  readonly emitted: Readonly<Record<string, string>>
  /** Cell path -> the bytes on disk. */
  readonly onDisk: Readonly<Record<string, string>>
}

type Verdict = {
  /** Cells of a complete role with no declaration beside them. */
  readonly undeclared: string[]
  /** Declarations naming no cell: an emission nothing consumes. */
  readonly orphaned: string[]
  /** Cells whose bytes differ from their declaration's emission. */
  readonly drifted: string[]
}

export const roleOfPath = (path: string): string | undefined => {
  // Longest first: `survivors.workflow.decl.ts` must read its role as `workflow`, and a bare `ts`
  // alternative matching first would read it as `decl` — a name no role carries, so the declaration
  // would be silently invisible to the gate rather than reported.
  const match = /\.([a-z]+)\.(?:term\.ts|decl\.ts|decl\.json|ts)$/.exec(path)
  const role = match?.[1]
  return role !== undefined && ROLES.includes(role) ? role : undefined
}

/**
 * A declaration lives under `terms/` rather than beside its cell, because `cell-suffix-required`
 * governs every file under `src/`: a declaration is not a cell, so `src/` is exactly where a
 * TypeScript one may not go. The `terms/` tree mirrors `src/`, and these functions are the mapping.
 *
 * A `.decl.json` is the exception and sits beside its cell, because JSON carries no suffix the rule
 * reads. That is the whole of its advantage and it is not worth the cost: a JSON declaration is
 * unchecked until an emitter runs, so every field name and every `kind` string is a spelling with no
 * checker behind it. Its TypeScript form is checked where it is written.
 */
export const cellOf = (declaration: string): string =>
  declaration.endsWith('.decl.json')
    ? declaration.replace(/\.decl\.json$/, '.ts')
    : declaration.replace('/terms/', '/src/').replace(/\.(term|decl)\.ts$/, '.ts')

/**
 * The three authorship forms a cell may have.
 *
 * A `.decl.ts` is a data description in TypeScript, typechecked as it is written and handed to the
 * emitter that owns its role's vocabulary. A `.decl.json` is the same description with no checker,
 * kept only while a role is mid-migration. A `.term.ts` is a program in the term language, compiled by
 * one compiler for every role — which is why the role appears in its filename but nowhere in the
 * language. A cell has at most one; any satisfies completeness, and two present is an orphan the gate
 * reports.
 */
export const declarationsOf = (cell: string): readonly string[] => [
  cell.replace(/\.ts$/, '.decl.json'),
  cell.replace('/src/', '/terms/').replace(/\.ts$/, '.decl.ts'),
  cell.replace('/src/', '/terms/').replace(/\.ts$/, '.term.ts'),
]

export const isTerm = (path: string): boolean => path.endsWith('.term.ts')

/** A data description in TypeScript: loaded as a module, then handed to its role's emitter. */
export const isTypedDeclaration = (path: string): boolean => path.endsWith('.decl.ts')

export const inPopulation = (path: string): boolean =>
  path.endsWith('.ts') &&
  roleOfPath(path) !== undefined &&
  path.includes('/src/') &&
  !OUTSIDE_POPULATION.some((fragment) => path.includes(fragment))

export const isDeclaration = (path: string): boolean => {
  const role = roleOfPath(path)
  if (role === undefined) return false
  // A data description is only meaningful where an emitter owns the role's vocabulary, in either
  // spelling; a term compiles for every role, because a program has no vocabulary to own.
  return path.endsWith('.term.ts') ||
    ((path.endsWith('.decl.json') || path.endsWith('.decl.ts')) && role in EMITTERS)
}

export const verdict = (evidence: Evidence): Verdict => {
  const declared = new Set(evidence.declarations)
  const cells = new Set(evidence.cells)
  return {
    undeclared: evidence.cells
      .filter((cell) =>
        COMPLETE_ROLES.includes(roleOfPath(cell) ?? '') && !declarationsOf(cell).some((d) => declared.has(d))
      )
      .sort(),
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
const formatted = async (source: string, declaration: string): Promise<string> => {
  const cell = cellOf(declaration)
  // The probe name comes from the declaration, not the cell, because a cell may have two
  // declarations beside it (`X.<role>.decl.json` and `terms/X.<role>.term.ts`) and the two probes
  // must be distinct files. It still sits beside the cell, so dprint's config selects it the same
  // way it selects the cell, and keeps the `.ts` extension.
  const leaf = declaration.slice(declaration.lastIndexOf('/') + 1)
  const stem = leaf.slice(0, leaf.indexOf('.'))
  const rest = leaf.slice(leaf.indexOf('.') + 1).replace(/\.json$/, '.ts')
  const probe = `${cell.slice(0, cell.lastIndexOf('/') + 1)}${stem}.authorship-probe.${rest}`
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

  // One pass over the tracked paths fills both arrays, keeping `git ls-files` order.
  const cells: string[] = []
  const declarations: string[] = []
  for (const path of tracked) {
    if (inPopulation(path)) cells.push(path)
    if (isDeclaration(path)) declarations.push(path)
  }

  // Emission is the slow part - a dynamic module load and a dprint subprocess per declaration -
  // so it runs in a bounded pool of 8. Results are collected and re-raised in declaration order,
  // so a concurrent run reports exactly the error the sequential path would have reported.
  const outcomes: Array<{ emitted?: string; error?: unknown }> = new Array(declarations.length)
  let cursor = 0
  const pool = Array.from({ length: 8 }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= declarations.length) return
      const decl = declarations[index]!
      try {
        // A term goes through `loadProgram`, which parses it against the role its filename names; a
        // data description goes to the emitter that owns that role's vocabulary. Compiling the loaded
        // program directly rather than re-parsing it keeps one precondition check per declaration.
        //
        // A TypeScript description is a module, so it arrives by import rather than by reading text.
        // The path is absolutised because a dynamic import resolves against this module, not the cwd.
        const source = isTerm(decl)
          ? compileProgram(await loadProgram(decl))
          : EMITTERS[roleOfPath(decl)!]!(
            isTypedDeclaration(decl)
              ? ((await import(new URL(decl, `file://${Deno.cwd()}/`).href)) as { default: unknown }).default
              : JSON.parse(await Deno.readTextFile(decl)),
          )
        outcomes[index] = { emitted: await formatted(source, decl) }
      } catch (error) {
        outcomes[index] = { error }
      }
    }
  })
  await Promise.all(pool)
  const emitted: Record<string, string> = {}
  for (let i = 0; i < declarations.length; i++) {
    const outcome = outcomes[i]!
    if (outcome.error !== undefined) throw outcome.error
    emitted[declarations[i]!] = outcome.emitted!
  }

  // `verdict` only ever compares cells that have a declaration beside them, so those are the only
  // cells read from disk.
  const declared = new Set(declarations.map(cellOf))
  const onDisk: Record<string, string> = {}
  await Promise.all(
    cells
      .filter((cell) => declared.has(cell))
      .map(async (cell) => {
        onDisk[cell] = await Deno.readTextFile(cell)
      }),
  )

  return { cells, declarations, emitted, onDisk }
}

/**
 * Regenerates every drifted cell from its declaration instead of reporting it.
 *
 * The gate already computes the bytes each declaration produces, so the only thing standing
 * between "your cell is stale" and a fixed tree was writing them out. This is the whole
 * ergonomic loop: edit the term, run this, the cell follows. It writes only cells the gate would
 * have failed on, so a clean tree is untouched and the command is safe to run at any time.
 */
const regenerate = async (evidence: Evidence, drifted: readonly string[]): Promise<void> => {
  for (const decl of drifted) {
    const cell = cellOf(decl)
    await Deno.writeTextFile(cell, evidence.emitted[decl]!)
    console.log(`regenerated ${cell} from ${decl}`)
  }
}

const main = async (): Promise<number> => {
  const evidence = await gather()
  const result = verdict(evidence)

  if (Deno.args.includes('--write')) {
    if (result.drifted.length === 0) console.log('guard-cell-authorship: every cell already matches its declaration')
    else await regenerate(evidence, result.drifted)
    // Orphans and hand-authored cells are not drift and cannot be fixed by writing bytes: one needs
    // a cell that does not exist, the other needs a declaration nobody has written.
    return result.orphaned.length + result.undeclared.length === 0 ? 0 : 1
  }

  for (const cell of result.undeclared) {
    const [decl, term] = declarationsOf(cell)
    console.error(
      `::error file=${cell}::hand-authored ${roleOfPath(cell)} cell. Every cell of a complete role is emitted: ` +
        `write ${decl} and regenerate with \`deno run scripts/tools/${roleOfPath(cell)}-emit.ts <decl> <out>\`, ` +
        `or write ${term} and compile it with \`deno run scripts/tools/term-compile.ts <term> <out>\`.`,
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
    console.error(`guard-cell-authorship: ${failures} failure(s) across ${evidence.cells.length} cell(s)`)
    return 1
  }
  // Roles with no cell in the tree are omitted: a role is an inventory entry, so reporting `0/0`
  // for one nobody uses states a fact about the list rather than about the repository.
  const perRole = ROLES
    .map((role) => {
      const cells = evidence.cells.filter((c) => roleOfPath(c) === role).length
      const decls = evidence.declarations.filter((d) => roleOfPath(d) === role).length
      if (cells === 0 && decls === 0) return undefined
      return `${role} ${COMPLETE_ROLES.includes(role) ? 'complete' : `${decls}/${cells}`}`
    })
    .filter((entry) => entry !== undefined)
    .join(', ')
  console.log(`guard-cell-authorship: ${evidence.declarations.length} declaration(s) round-trip clean — ${perRole}`)
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
    label: 'a hand-authored cell of a complete role is undeclared',
    evidence: {
      cells: ['p/src/a.workflow.ts'],
      declarations: [],
      emitted: {},
      onDisk: { 'p/src/a.workflow.ts': 'export const a = 1\n' },
    },
    expect: { undeclared: ['p/src/a.workflow.ts'], orphaned: [], drifted: [] },
  },
  {
    label: 'a term satisfies completeness for a cell of a complete role, exactly as a declaration does',
    evidence: {
      cells: ['p/src/a.workflow.ts'],
      declarations: ['p/terms/a.workflow.term.ts'],
      emitted: { 'p/terms/a.workflow.term.ts': 'export const a = 1\n' },
      onDisk: { 'p/src/a.workflow.ts': 'export const a = 1\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: [] },
  },
  {
    label: 'a term owes the same fidelity: a cell edited after compilation has drifted',
    evidence: {
      cells: ['p/src/a.executor.ts'],
      declarations: ['p/terms/a.executor.term.ts'],
      emitted: { 'p/terms/a.executor.term.ts': 'export const a = 1\n' },
      onDisk: { 'p/src/a.executor.ts': 'export const a = 2\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: ['p/terms/a.executor.term.ts'] },
  },
  {
    label: 'a term whose cell was deleted is orphaned, so the two forms cannot hide each other',
    evidence: {
      cells: [],
      declarations: ['p/terms/a.workflow.term.ts'],
      emitted: { 'p/terms/a.workflow.term.ts': 'export const a = 1\n' },
      onDisk: {},
    },
    expect: { undeclared: [], orphaned: ['p/terms/a.workflow.term.ts'], drifted: [] },
  },
  {
    label: 'a hand-authored cell of an incomplete role is not yet required to be declared',
    evidence: {
      cells: ['p/src/a.executor.ts'],
      declarations: [],
      emitted: {},
      onDisk: { 'p/src/a.executor.ts': 'export const a = 1\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: [] },
  },
  {
    label: 'an incomplete role still owes fidelity where a declaration exists',
    evidence: {
      cells: ['p/src/a.executor.ts'],
      declarations: ['p/src/a.executor.decl.json'],
      emitted: { 'p/src/a.executor.decl.json': 'export const a = 1\n' },
      onDisk: { 'p/src/a.executor.ts': 'export const a = 2\n' },
    },
    expect: { undeclared: [], orphaned: [], drifted: ['p/src/a.executor.decl.json'] },
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
  { path: 'packages/p/src/internal/a.executor.ts', expect: true },
  { path: 'packages/p/src/__tests__/a.workflow.ts', expect: false },
  { path: 'packages/p/src/fixtures/a.workflow.ts', expect: false },
  { path: 'packages/p/src/internal/falsify-probe.workflow.ts', expect: false },
  { path: 'packages/p/src/a.authorship-probe.workflow.ts', expect: false },
  { path: 'packages/p/src/a.schema.ts', expect: true },
  // Every sanctioned role is in the population, because one compiler regenerates any of them. The
  // gate governed only the four data-emitter roles while a data description was the only input.
  { path: 'packages/p/src/a.kernel.ts', expect: true },
  { path: 'packages/p/src/a.handler.ts', expect: true },
  { path: 'packages/p/src/a.nonsense.ts', expect: false },
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
    console.error(`guard-cell-authorship: selftest FAILED (${failures.length}/${total})\n`)
    for (const failure of failures) console.error(failure)
    return 1
  }
  console.log(`guard-cell-authorship: selftest ok (${total} fixtures)`)
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
