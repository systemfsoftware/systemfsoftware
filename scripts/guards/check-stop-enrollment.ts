#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write=/tmp --allow-env
// Stop-enrollment guard (U5, R2, R3, KTD5).
//
// Enrollment follows from what a unit *is*, never from its author opting in.
// A module (a `src/**/*.ts` file of a workspace package) is enrolled when any
// top-level declaration in it — exported or not — has a unit type: a Cell
// (carrying `CellTypeId`), a Blueprint or its Definition, a Handle or its
// Definition, a `Supervisor.Medium`/`MediumPortShape` service, or a function
// whose return type is one of those. A module that declares a brand or its kind
// machinery is a kind, not a unit, and is never enrolled.
//
// A module is linked only when a `*.conformance.test.ts` in the same package
// passes `Conformance.stopped` an argument tree containing a symbol that
// resolves to any export of that module. Any unlinked module fails the guard;
// zero enrolled modules is a pass that still reports the count.
//
// The type walk runs through one TypeScript program built over every workspace
// package's `src`, so aliases (`WrittenCell` in a `Sandwich.named(...)...write`
// chain) and combinator-built values count alike. Neither filename suffixes nor
// constructor names are keys.
import { dirname, join, relative, resolve } from '@std/path'
import { parse } from '@std/yaml'
import {
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedImports,
  isNamespaceImport,
  isPropertyAccessExpression,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isVariableStatement,
  SyntaxKind,
} from 'typescript/unstable/ast'
import type { Node, SourceFile } from 'typescript/unstable/ast'
import { API, SignatureKind, SymbolFlags } from 'typescript/unstable/async'
import type { Checker, Program, Snapshot, Symbol, Type } from 'typescript/unstable/async'

const WS = 'pnpm-workspace.yaml'
const MANIFEST = 'package.json'
const CONFORMANCE_MODULE = '@systemfsoftware/conformance-spec'
const CONFORMANCE_TEST = /\.conformance\.test\.ts$/
const SOURCE_SUFFIX = /\.(?:ts|tsx|mts|cts)$/
const DECLARATION_SUFFIX = /\.d\.(?:ts|mts|cts)$/
const TESTISH_SUFFIX = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$/
const TEST_DIRS = new Set(['__tests__', '__fixtures__', 'test', 'tests'])
const PRUNED_DIRS = new Set(['node_modules', 'dist', 'repos', '.git'])

/** The directories whose packages enroll modules (R2). */
const ROOTS = ['packages', 'examples', 'omp', 'agent-plugins'] as const

/** The unit types, keyed to the file that declares each one. */
const UNIT_TYPES: ReadonlyArray<{ readonly suffix: string; readonly names: readonly string[] }> = [
  { suffix: 'effect-cell-types/src/Cell.ts', names: ['Cell'] },
  { suffix: 'effect-cell-types/src/Blueprint.ts', names: ['Blueprint', 'Definition'] },
  { suffix: 'effect-cell-types/src/Handle.ts', names: ['Handle', 'Definition'] },
  { suffix: 'effect-daemon-spec/src/Supervisor/Medium.ts', names: ['Medium', 'MediumPortShape'] },
]

const CELL_BRAND_SYMBOL = 'CellTypeId'
const MEDIUM_PORT_TAG_INTERFACE = 'Service'

type Pkg = {
  readonly dir: string
  readonly name: string
  readonly entry: string | undefined
}

type ModuleUnit = {
  readonly pkg: string
  readonly file: string
  readonly decls: readonly string[]
  readonly linkIds: ReadonlySet<number>
}

type RunResult = {
  readonly enrolled: number
  readonly linked: number
  readonly packages: number
  readonly violations: readonly string[]
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

const isSourceFile = (path: string): boolean => SOURCE_SUFFIX.test(path) && !DECLARATION_SUFFIX.test(path)

const underTest = (path: string): boolean => {
  const segments = path.split('/')
  return TESTISH_SUFFIX.test(path) || segments.some((segment) => TEST_DIRS.has(segment))
}

const walk = async (dir: string, keep: (path: string) => boolean): Promise<readonly string[]> => {
  const found: string[] = []
  try {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name)
      if (entry.isDirectory) {
        if (PRUNED_DIRS.has(entry.name)) continue
        found.push(...await walk(path, keep))
      } else if (keep(path)) {
        found.push(path)
      }
    }
  } catch {
    return found
  }
  return found
}

const sourceModulesOf = async (pkg: Pkg): Promise<readonly string[]> =>
  (await walk(join(pkg.dir, 'src'), isSourceFile)).filter((path) => !underTest(path)).toSorted()

/** Every directory under the roots (and the workspace globs) that holds a `package.json`. */
const discoverPackages = async (root: string): Promise<readonly Pkg[]> => {
  const dirs = new Set<string>()

  const wsPath = join(root, WS)
  if (await exists(wsPath)) {
    const doc = parse(await Deno.readTextFile(wsPath)) as { packages?: unknown }
    const globs = Array.isArray(doc?.packages) ? doc.packages.filter((g): g is string => typeof g === 'string') : []
    for (const glob of globs) {
      if (!glob.includes('*')) continue
      let current = [root]
      for (const part of glob.split('/')) {
        const next: string[] = []
        for (const dir of current) {
          if (part === '*') {
            if (!(await exists(dir))) continue
            for await (const entry of Deno.readDir(dir)) {
              if (entry.isDirectory && !PRUNED_DIRS.has(entry.name)) next.push(join(dir, entry.name))
            }
          } else {
            next.push(join(dir, part))
          }
        }
        current = next
      }
      for (const dir of current) if (await exists(join(dir, MANIFEST))) dirs.add(dir)
    }
  }

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > 3 || !(await exists(dir))) return
    if (await exists(join(dir, MANIFEST))) {
      dirs.add(dir)
      return
    }
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isDirectory && !PRUNED_DIRS.has(entry.name)) await visit(join(dir, entry.name), depth + 1)
    }
  }
  for (const name of ROOTS) await visit(join(root, name), 0)

  const packages: Pkg[] = []
  for (const dir of [...dirs].sort()) {
    const manifest = JSON.parse(await Deno.readTextFile(join(dir, MANIFEST))) as {
      name?: unknown
      exports?: Record<string, Record<string, string> | string>
      main?: string
    }
    const name = typeof manifest.name === 'string' ? manifest.name : relative(root, dir)
    packages.push({ dir, name, entry: await entryOf(dir, manifest) })
  }
  return packages
}

const entryOf = async (
  dir: string,
  manifest: { exports?: Record<string, Record<string, string> | string>; main?: string },
): Promise<string | undefined> => {
  const rootExport = manifest.exports?.['.']
  const source = typeof rootExport === 'object' ? rootExport?.['@systemfsoftware/source'] : undefined
  const candidates = [
    typeof source === 'string' ? source : undefined,
    'src/mod.ts',
    'src/index.ts',
    typeof manifest.main === 'string' ? manifest.main : undefined,
  ]
  for (const candidate of candidates) {
    if (candidate === undefined) continue
    const path = resolve(dir, candidate)
    if (await exists(path)) return path
  }
  return undefined
}

const namedSymbol = async (type: Type) => (await type.getAliasSymbol()) ?? (await type.getSymbol())

/** The symbol an alias points at; a non-alias symbol resolves to itself. `getAliasedSymbol` panics on a non-alias. */
const resolveAlias = async (checker: Checker, symbol: Symbol): Promise<Symbol> =>
  (symbol.flags & SymbolFlags.Alias) === 0 ? symbol : await checker.getAliasedSymbol(symbol)

/** Whether the type is one of the unit types, descending aliases, unions and intersections. */
const carriesUnit = async (
  checker: Checker,
  units: ReadonlySet<number>,
  type: Type,
  visited: Set<number>,
): Promise<boolean> => {
  if (visited.has(type.id)) return false
  visited.add(type.id)
  const named = await namedSymbol(type)
  if (named !== undefined && units.has(named.id)) return true
  if (type.isIntersectionType() || type.isUnionType()) {
    for (const member of await type.getTypes()) {
      if (await carriesUnit(checker, units, member, visited)) return true
    }
  }
  if (type.isTypeReference()) {
    const target = await type.getTarget()
    const carrier = await target.getSymbol()
    if (carrier?.name === MEDIUM_PORT_TAG_INTERFACE) {
      for (const argument of await checker.getTypeArguments(type)) {
        const argumentNamed = await namedSymbol(argument)
        if (argumentNamed !== undefined && units.has(argumentNamed.id)) return true
      }
    }
  }
  return false
}

/** Whether the symbol's type, or the return type of its call signatures, is a unit type. */
const declarationIsUnit = async (
  checker: Checker,
  units: ReadonlySet<number>,
  symbol: Symbol,
): Promise<boolean> => {
  const type = await checker.getTypeOfSymbol(symbol)
  if (type === undefined) return false
  if (await carriesUnit(checker, units, type, new Set())) return true
  for (const signature of await checker.getSignaturesOfType(type, SignatureKind.Call)) {
    const returned = await checker.getReturnTypeOfSignature(signature)
    if (returned !== undefined && await carriesUnit(checker, units, returned, new Set())) return true
  }
  return false
}

/** A module declaring a brand or its kind machinery is a kind, never a unit. */
const isKindModule = async (
  checker: Checker,
  units: ReadonlySet<number>,
  file: SourceFile,
): Promise<boolean> => {
  for (const statement of file.statements) {
    if (isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (isIdentifier(declaration.name) && declaration.name.text === CELL_BRAND_SYMBOL) return true
      }
    } else if (isInterfaceDeclaration(statement)) {
      const symbol = await checker.getSymbolAtLocation(statement.name)
      if (symbol !== undefined && units.has((await resolveAlias(checker, symbol)).id)) return true
    } else if (isTypeAliasDeclaration(statement)) {
      const symbol = await checker.getSymbolAtLocation(statement.name)
      if (symbol !== undefined && units.has((await resolveAlias(checker, symbol)).id)) return true
      if (statement.type.kind !== SyntaxKind.IntersectionType && statement.type.kind !== SyntaxKind.UnionType) continue
      for (const node of flatten(statement.type)) {
        if (!isTypeReferenceNode(node)) continue
        const referenced = await checker.getSymbolAtLocation(node.typeName)
        if (referenced !== undefined && units.has((await resolveAlias(checker, referenced)).id)) return true
      }
    }
  }
  return false
}

/** Every module of the package's `src/` that declares a unit, and the ids of its exports. */
const enrollModules = async (
  root: string,
  pkg: Pkg,
  checker: Checker,
  program: Program,
  units: ReadonlySet<number>,
): Promise<readonly ModuleUnit[]> => {
  const modules: ModuleUnit[] = []
  for (const source of await sourceModulesOf(pkg)) {
    const file = await program.getSourceFile(source)
    if (file === undefined) continue
    if (await isKindModule(checker, units, file)) continue
    const decls: string[] = []
    for (const statement of file.statements) {
      if (isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!isIdentifier(declaration.name)) continue
          const symbol = await checker.getSymbolAtLocation(declaration.name)
          if (symbol !== undefined && await declarationIsUnit(checker, units, symbol)) {
            decls.push(declaration.name.text)
          }
        }
      } else if (isFunctionDeclaration(statement) && statement.name !== undefined) {
        const symbol = await checker.getSymbolAtLocation(statement.name)
        if (symbol !== undefined && await declarationIsUnit(checker, units, symbol)) decls.push(statement.name.text)
      }
    }
    if (decls.length === 0) continue
    const linkIds = new Set<number>()
    const moduleSymbol = await checker.getSymbolAtLocation(file)
    if (moduleSymbol !== undefined) {
      for (const exported of await checker.getExportsOfModule(moduleSymbol)) {
        linkIds.add(exported.id)
        const resolved = await resolveAlias(checker, exported)
        if (!(await checker.isUnknownSymbol(resolved))) linkIds.add(resolved.id)
      }
    }
    modules.push({ pkg: relative(root, pkg.dir), file: relative(root, file.fileName), decls, linkIds })
  }
  return modules
}

/** The symbol ids an argument tree hands to `Conformance.stopped` anywhere in the package. */
const handedToStopped = async (pkg: Pkg, checker: Checker, program: Program): Promise<ReadonlySet<number>> => {
  const handed = new Set<number>()
  const tests = [...await walk(pkg.dir, (path) => CONFORMANCE_TEST.test(path))].sort()
  for (const test of tests) {
    const file = await program.getSourceFile(test)
    if (file === undefined) continue
    const nodes = flatten(file)
    const bindings = new Set<string>()
    for (const node of nodes) {
      if (!isImportDeclaration(node) || !isStringLiteral(node.moduleSpecifier)) continue
      if (node.moduleSpecifier.text !== CONFORMANCE_MODULE) continue
      const bindingsNode = node.importClause?.namedBindings
      if (bindingsNode === undefined) continue
      if (isNamedImports(bindingsNode)) {
        for (const element of bindingsNode.elements) {
          if (element.name.text === 'Conformance') bindings.add(element.name.text)
        }
      } else if (isNamespaceImport(bindingsNode)) {
        bindings.add(bindingsNode.name.text)
      }
    }
    if (bindings.size === 0) continue
    for (const node of nodes) {
      if (!isCallExpression(node) || !isPropertyAccessExpression(node.expression)) continue
      if (node.expression.name.text !== 'stopped') continue
      const receiver = node.expression.expression
      if (!isIdentifier(receiver) || !bindings.has(receiver.text)) continue
      for (const argument of node.arguments) {
        for (const inner of flatten(argument)) {
          if (!isIdentifier(inner)) continue
          const symbol = await checker.getSymbolAtLocation(inner)
          if (symbol === undefined) continue
          handed.add(symbol.id)
          const resolved = await resolveAlias(checker, symbol)
          if (!(await checker.isUnknownSymbol(resolved))) handed.add(resolved.id)
        }
      }
    }
  }
  return handed
}

const flatten = (root: Node): readonly Node[] => {
  const nodes: Node[] = []
  const visit = (node: Node): void => {
    nodes.push(node)
    node.forEachChild((child) => visit(child))
  }
  visit(root)
  return nodes
}

/** The unit type symbols, read from the program itself so identity survives aliasing and re-export. */
const unitTypeSymbols = async (checker: Checker, program: Program): Promise<ReadonlySet<number>> => {
  const names = await program.getSourceFileNames()
  const ids = new Set<number>()
  for (const target of UNIT_TYPES) {
    const file = names.find((name) => name.replaceAll('\\', '/').endsWith(target.suffix))
    if (file === undefined) throw new Error(`unit type file not in the program: ${target.suffix}`)
    const source = await program.getSourceFile(file)
    if (source === undefined) throw new Error(`unit type file unreadable: ${file}`)
    const moduleSymbol = await checker.getSymbolAtLocation(source)
    if (moduleSymbol === undefined) throw new Error(`unit type module has no symbol: ${file}`)
    const exports = await checker.getExportsOfModule(moduleSymbol)
    for (const name of target.names) {
      const symbol = exports.find((candidate) => candidate.name === name)
      if (symbol === undefined) throw new Error(`unit type export missing: ${name} in ${file}`)
      ids.add(symbol.id)
    }
  }
  return ids
}

const run = async (root: string): Promise<RunResult> => {
  const pkgs = await discoverPackages(root)
  if (pkgs.length === 0) throw new Error('no workspace package found under packages/, examples/, omp/, agent-plugins/')

  const files: string[] = []
  for (const pkg of pkgs) {
    files.push(...await sourceModulesOf(pkg))
    files.push(...await walk(pkg.dir, (path) => CONFORMANCE_TEST.test(path)))
  }
  files.sort()

  const paths: Record<string, string[]> = {}
  for (const pkg of pkgs) if (pkg.entry !== undefined) paths[pkg.name] = [pkg.entry]

  const tempDir = await Deno.makeTempDir({ prefix: 'stop-enrollment-' })
  try {
    const configPath = join(tempDir, 'tsconfig.json')
    await Deno.writeTextFile(
      configPath,
      JSON.stringify({
        compilerOptions: {
          paths,
          customConditions: ['@systemfsoftware/source'],
          moduleResolution: 'bundler',
          module: 'preserve',
          target: 'esnext',
          jsx: 'preserve',
          resolveJsonModule: true,
          allowJs: false,
          strict: false,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        files,
      }),
    )

    const api = new API()
    let snapshot: Snapshot | undefined
    try {
      snapshot = await api.updateSnapshot({ openProjects: [configPath] })
      const project = snapshot.getProjects().find((candidate) => candidate.configFileName === configPath) ??
        snapshot.getProjects()[0]
      if (project === undefined) throw new Error('the compiler produced no project over the workspace sources')
      const { checker, program } = project
      const units = await unitTypeSymbols(checker, program)

      const violations: string[] = []
      let enrolled = 0
      let linked = 0
      for (const pkg of pkgs) {
        const modules = await enrollModules(root, pkg, checker, program, units)
        enrolled += modules.length
        const handed = await handedToStopped(pkg, checker, program)
        for (const module of modules) {
          if ([...module.linkIds].some((id) => handed.has(id))) linked++
          else violations.push(`${module.pkg} ${module.file}: has no stop rule (${module.decls.join(', ')})`)
        }
      }
      violations.sort()
      return { enrolled, linked, packages: pkgs.length, violations }
    } finally {
      await snapshot?.dispose()
      await api.close()
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
}

const main = async (): Promise<number> => {
  const { enrolled, linked, packages, violations } = await run(Deno.cwd())
  if (violations.length > 0) {
    console.error(
      `stop enrollment: ${violations.length} of ${enrolled} enrolled module(s) have no stop rule, across ${packages} package(s):`,
    )
    console.error('')
    for (const violation of violations) console.error(violation)
    console.error('')
    console.error(
      'Every module that declares a Cell, Blueprint, Handle, or Supervisor.Medium port states how it stops: a',
    )
    console.error(
      '*.conformance.test.ts in the same package passes one of its exports to Conformance.stopped (R2, R3).',
    )
    return 1
  }
  console.log(
    `stop enrollment: ${enrolled} enrolled module(s), ${linked} with a stop rule, across ${packages} package(s)`,
  )
  return 0
}

const plant = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await Deno.mkdir(dirname(target), { recursive: true })
    await Deno.writeTextFile(target, content)
  }
}

const pkgJson = (name: string): string =>
  JSON.stringify({ name, type: 'module', exports: { '.': { '@systemfsoftware/source': './src/mod.ts' } } }) + '\n'

const CELL_SOURCE = `export const CellTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Cell')
export interface Cell<I> {
  readonly [CellTypeId]: CellTypeId
  readonly run: (input: I) => unknown
}
export const id = <I>(): Cell<I> => ({ [CellTypeId]: CellTypeId, run: (input: I) => input })
`
const BLUEPRINT_SOURCE = `export interface Blueprint<T extends symbol, Spec> {
  readonly spec: Spec
  readonly typeId: T
}
export interface Definition<T extends symbol, Spec> {
  readonly spec: Spec
  readonly typeId: T
}
`
const HANDLE_SOURCE = `export interface Handle<T extends symbol, Data extends object> {
  readonly typeId: T
}
export interface Definition<T extends symbol, Data extends object> {
  readonly typeId: T
}
`
const MEDIUM_SOURCE = `export interface MediumOptions<Program> {
  readonly program: Program
}
export type Medium<Program> = MediumOptions<Program>
export type MediumPortShape<Program> = { readonly medium: Medium<Program> }
`

const BRAND_FIXTURE: Readonly<Record<string, string>> = {
  'pnpm-workspace.yaml': "packages:\n  - 'pkgs/*'\n",
  'pkgs/effect-cell-types/package.json': pkgJson('@systemfsoftware/effect-cell-types'),
  'pkgs/effect-cell-types/src/Cell.ts': CELL_SOURCE,
  'pkgs/effect-cell-types/src/Blueprint.ts': BLUEPRINT_SOURCE,
  'pkgs/effect-cell-types/src/Handle.ts': HANDLE_SOURCE,
  'pkgs/effect-cell-types/src/mod.ts':
    "export * from './Cell.js'\nexport * from './Blueprint.js'\nexport * from './Handle.js'\n",
  'pkgs/effect-daemon-spec/package.json': pkgJson('@systemfsoftware/effect-daemon-spec'),
  'pkgs/effect-daemon-spec/src/Supervisor/Medium.ts': MEDIUM_SOURCE,
  'pkgs/effect-daemon-spec/src/mod.ts': "export * from './Supervisor/Medium.js'\n",
  'pkgs/conformance-spec/package.json': pkgJson('@systemfsoftware/conformance-spec'),
  'pkgs/conformance-spec/src/Conformance/mod.ts':
    'export const stopped = (_unit: unknown): void => {}\nexport const released = (_program: unknown): void => {}\n',
  'pkgs/conformance-spec/src/mod.ts': "export * as Conformance from './Conformance/mod.js'\n",
}

const selftest = async (): Promise<number> => {
  const failures: string[] = []
  const wsRoot = await Deno.makeTempDir({ prefix: 'stop-enrollment-selftest-' })
  try {
    await plant(wsRoot, {
      ...BRAND_FIXTURE,

      // A medium with no stop check (AE5).
      'pkgs/medium-unlinked/package.json': pkgJson('@systemfsoftware/medium-unlinked'),
      'pkgs/medium-unlinked/src/mod.ts':
        "import type { Medium } from '@systemfsoftware/effect-daemon-spec'\ndeclare function build(): Medium<() => void>\nexport const UnlinkedMedium = build()\n",

      // The same medium, handed to Conformance.stopped in its own package.
      'pkgs/medium-linked/package.json': pkgJson('@systemfsoftware/medium-linked'),
      'pkgs/medium-linked/src/mod.ts':
        "import type { Medium } from '@systemfsoftware/effect-daemon-spec'\ndeclare function build(): Medium<() => void>\nexport const LinkedMedium = build()\n",
      'pkgs/medium-linked/tests/medium.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { LinkedMedium } from '../src/mod.js'\nConformance.stopped(LinkedMedium)\n",

      // A Sandwich-built Cell (via an intersection alias) and a combinator-built Cell.
      'pkgs/cells/package.json': pkgJson('@systemfsoftware/cells'),
      'pkgs/cells/src/sandwich.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport type WrittenCell<I, A> = Cell<I> & { readonly phases: readonly string[] }\nexport const chain: Cell<number> = id<number>()\n",
      'pkgs/cells/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nimport type { WrittenCell } from './sandwich.js'\ndeclare function build<T>(): T\nexport const SandwichCell: WrittenCell<number, string> = build()\nexport const CombinatorCell: Cell<number> = id<number>()\n",

      // A Blueprint declared outside any `.blueprint.ts` file.
      'pkgs/blueprint-not-suffixed/package.json': pkgJson('@systemfsoftware/blueprint-not-suffixed'),
      'pkgs/blueprint-not-suffixed/src/anything.ts':
        "import type { Blueprint } from '@systemfsoftware/effect-cell-types'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\ndeclare function build<T>(): T\nexport const Widget: Blueprint<typeof WidgetId, { n: number }> = build()\n",

      // A stop check that hands over an export of a different module than the unit it must cover.
      'pkgs/wrong-export/package.json': pkgJson('@systemfsoftware/wrong-export'),
      'pkgs/wrong-export/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const WrongCell: Cell<number> = id<number>()\n",
      'pkgs/wrong-export/src/other.ts': 'export const other = 1\n',
      'pkgs/wrong-export/tests/other.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { other } from '../src/other.js'\nConformance.stopped(other)\n",

      // A stop check outside a `*.conformance.test.ts` file does not link.
      'pkgs/stop-outside/package.json': pkgJson('@systemfsoftware/stop-outside'),
      'pkgs/stop-outside/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const LooseCell: Cell<number> = id<number>()\n",
      'pkgs/stop-outside/tests/loose.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { LooseCell } from '../src/mod.js'\nConformance.stopped(LooseCell)\n",

      // A package with no units passes and contributes nothing.
      'pkgs/no-units/package.json': pkgJson('@systemfsoftware/no-units'),
      'pkgs/no-units/src/mod.ts': 'export const answer = 42\n',

      // A private Blueprint Definition behind an exported `make`.
      'pkgs/private-blueprint/package.json': pkgJson('@systemfsoftware/private-blueprint'),
      'pkgs/private-blueprint/src/mod.ts':
        "import type { Blueprint, Definition } from '@systemfsoftware/effect-cell-types'\nconst WindowId: unique symbol = Symbol.for('test/Window')\nconst Window: Definition<typeof WindowId, { n: number }> = { typeId: WindowId, spec: { n: 1 } }\ndeclare function toBlueprint<T>(): T\nexport const make = (): Blueprint<typeof WindowId, { n: number }> => toBlueprint()\n",
      'pkgs/private-blueprint-linked/package.json': pkgJson('@systemfsoftware/private-blueprint-linked'),
      'pkgs/private-blueprint-linked/src/mod.ts':
        "import type { Blueprint, Definition } from '@systemfsoftware/effect-cell-types'\nconst WindowId: unique symbol = Symbol.for('test/Window')\nconst Window: Definition<typeof WindowId, { n: number }> = { typeId: WindowId, spec: { n: 1 } }\ndeclare function toBlueprint<T>(): T\nexport const make = (): Blueprint<typeof WindowId, { n: number }> => toBlueprint()\n",
      'pkgs/private-blueprint-linked/tests/window.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { make } from '../src/mod.js'\nConformance.stopped(make)\n",

      // A private Cell behind an exported runner.
      'pkgs/private-cell/package.json': pkgJson('@systemfsoftware/private-cell'),
      'pkgs/private-cell/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nconst hidden: Cell<number> = id<number>()\nexport const run = (input: number) => hidden.run(input)\n",
      'pkgs/private-cell-linked/package.json': pkgJson('@systemfsoftware/private-cell-linked'),
      'pkgs/private-cell-linked/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nconst hidden: Cell<number> = id<number>()\nexport const run = (input: number) => hidden.run(input)\n",
      'pkgs/private-cell-linked/tests/cell.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { run } from '../src/mod.js'\nConformance.stopped(run)\n",
    })

    const expected = [
      'pkgs/blueprint-not-suffixed pkgs/blueprint-not-suffixed/src/anything.ts: has no stop rule (Widget)',
      'pkgs/cells pkgs/cells/src/mod.ts: has no stop rule (SandwichCell, CombinatorCell)',
      'pkgs/medium-unlinked pkgs/medium-unlinked/src/mod.ts: has no stop rule (build, UnlinkedMedium)',
      'pkgs/private-blueprint pkgs/private-blueprint/src/mod.ts: has no stop rule (Window, make)',
      'pkgs/private-cell pkgs/private-cell/src/mod.ts: has no stop rule (hidden)',
      'pkgs/stop-outside pkgs/stop-outside/src/mod.ts: has no stop rule (LooseCell)',
      'pkgs/wrong-export pkgs/wrong-export/src/mod.ts: has no stop rule (WrongCell)',
    ].sort()

    const result = await run(wsRoot)
    if (JSON.stringify(result.violations) !== JSON.stringify(expected)) {
      failures.push(
        `  unlinked modules:\n    expected ${JSON.stringify(expected)}\n    got      ${
          JSON.stringify(result.violations)
        }`,
      )
    }
    if (result.enrolled !== 10 || result.linked !== 3) {
      failures.push(`  counts: expected 10 enrolled / 3 linked, got ${result.enrolled} / ${result.linked}`)
    }
    for (const kind of ['effect-cell-types/src/Cell.ts', 'pkgs/cells/src/sandwich.ts']) {
      const kinds = result.violations.filter((violation) => violation.includes(kind))
      if (kinds.length > 0) failures.push(`  a kind module was enrolled: ${JSON.stringify(kinds)}`)
    }

    const bareRoot = await Deno.makeTempDir({ prefix: 'stop-enrollment-zero-' })
    try {
      await plant(bareRoot, BRAND_FIXTURE)
      const bare = await run(bareRoot)
      if (bare.enrolled !== 0 || bare.violations.length !== 0) {
        failures.push(
          `  zero enrolled: expected a pass with 0 modules, got enrolled=${bare.enrolled} violations=${
            JSON.stringify(bare.violations)
          }`,
        )
      }
    } finally {
      await Deno.remove(bareRoot, { recursive: true }).catch(() => {})
    }

    if (failures.length > 0) {
      console.error(`check-stop-enrollment: selftest FAILED (${failures.length})\n`)
      for (const failure of failures) console.error(failure)
      return 1
    }
    console.log(
      `check-stop-enrollment: selftest ok (${expected.length} unlinked modules named, ${result.enrolled} enrolled, ${result.linked} linked)`,
    )
    return 0
  } finally {
    await Deno.remove(wsRoot, { recursive: true }).catch(() =>
      console.error(`warning: could not remove the fixture ${wsRoot}`)
    )
  }
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? await selftest() : await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
