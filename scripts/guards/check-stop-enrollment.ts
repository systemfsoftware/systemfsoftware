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
// A stop check links a module when it reaches one of the module's unit
// declarations: the argument's own declaration, or a value reference reachable
// from a reached declaration's initializer or body, within the same package.
//
// A package whose `test` script names `--project` flags must name `conformance`.
//
// The declaration walk runs through one TypeScript program built over every
// workspace package's `src`, so aliases (`WrittenCell` in a
// `Sandwich.named(...)...write` chain) and combinator-built values count alike.
// Neither filename suffixes nor constructor names are keys.
import { dirname, join, relative, resolve } from '@std/path'
import { parse } from '@std/yaml'
import {
  isArrowFunction,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isNamedImports,
  isNamespaceImport,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeNode,
  isTypeReferenceNode,
  isVariableDeclaration,
  isVariableStatement,
  SyntaxKind,
} from 'typescript/unstable/ast'
import type { Identifier, Node, SourceFile } from 'typescript/unstable/ast'
import { API, SignatureKind, SymbolFlags } from 'typescript/unstable/async'
import type { Checker, NodeHandle, Program, Project, Snapshot, Symbol, Type } from 'typescript/unstable/async'

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
  readonly exports: Readonly<Record<string, Readonly<Record<string, string>> | string>> | undefined
  readonly test: string | undefined
}

/** A declaration of unit type: the name it publishes and the node key that identifies it. */
type UnitDeclaration = {
  readonly name: string
  readonly key: string
}

type ModuleUnit = {
  readonly pkg: string
  readonly file: string
  readonly absolute: string
  readonly decls: readonly UnitDeclaration[]
}

/** A declaration a stop check reaches: the node handle and the file that holds it. */
type ReachedDeclaration = {
  readonly handle: NodeHandle
  readonly file: string
}

type RunResult = {
  readonly enrolled: number
  readonly linked: number
  readonly direct: number
  readonly transitive: number
  readonly packages: number
  readonly violations: readonly string[]
  readonly unrouted: readonly string[]
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

const inside = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`)

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
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return found
    throw new Error(`cannot read ${dir}: ${error instanceof Error ? error.message : String(error)}`)
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
      scripts?: Record<string, unknown>
    }
    const name = typeof manifest.name === 'string' ? manifest.name : relative(root, dir)
    const test = typeof manifest.scripts?.test === 'string' ? manifest.scripts.test : undefined
    packages.push({ dir, name, entry: await entryOf(dir, manifest), exports: manifest.exports, test })
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
    const decls: UnitDeclaration[] = []
    for (const statement of file.statements) {
      if (isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!isIdentifier(declaration.name)) continue
          const symbol = await checker.getSymbolAtLocation(declaration.name)
          if (symbol !== undefined && await declarationIsUnit(checker, units, symbol)) {
            decls.push({ name: declaration.name.text, key: `${file.fileName}:${declaration.pos}` })
          }
        }
      } else if (isFunctionDeclaration(statement) && statement.name !== undefined) {
        const symbol = await checker.getSymbolAtLocation(statement.name)
        if (symbol !== undefined && await declarationIsUnit(checker, units, symbol)) {
          decls.push({ name: statement.name.text, key: `${file.fileName}:${statement.pos}` })
        }
      }
    }
    if (decls.length === 0) continue
    modules.push({ pkg: relative(root, pkg.dir), file: relative(root, file.fileName), absolute: file.fileName, decls })
  }
  return modules
}

/** The declarations a same-package `Conformance.stopped` argument reaches. */
const handedDeclarations = async (
  pkg: Pkg,
  checker: Checker,
  program: Program,
  project: Project,
): Promise<{ readonly files: ReadonlySet<string>; readonly decls: readonly ReachedDeclaration[] }> => {
  const files = new Set<string>()
  const decls: ReachedDeclaration[] = []
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
        for (const inner of valueReferences(argument)) {
          const symbol = await checker.getSymbolAtLocation(inner)
          if (symbol === undefined) continue
          const resolved = await resolveAlias(checker, symbol)
          if (await checker.isUnknownSymbol(resolved)) continue
          const declaration = await valueDeclarationOf(checker, project, resolved)
          if (declaration === undefined || !inside(declaration.file, pkg.dir)) continue
          files.add(declaration.file)
          decls.push(declaration)
        }
      }
    }
  }
  return { files, decls }
}

const SOURCE_EXT = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/
const MODULE_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts'] as const

/** The source file a package's `exports` subpath names, under the source condition. */
const exportedSubpath = (pkg: Pkg, subpath: string): string | undefined => {
  const map = pkg.exports
  if (map === undefined) return undefined
  const key = `./${subpath.replace(SOURCE_EXT, '')}`
  const pick = (target: Readonly<Record<string, string>> | string | undefined): string | undefined => {
    const source = typeof target === 'object' ? target['@systemfsoftware/source'] : target
    return typeof source === 'string' ? resolve(pkg.dir, source) : undefined
  }
  const exact = pick(map[key])
  if (exact !== undefined) return exact
  for (const [pattern, target] of Object.entries(map)) {
    const star = pattern.indexOf('*')
    if (star < 0) continue
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
    const stem = pick(target)
    if (stem !== undefined) return stem.replace('*', key.slice(prefix.length, key.length - suffix.length))
  }
  return undefined
}

/** A specifier resolved to a source file inside the package's `src/`, or undefined at the boundary. */
const resolveSpecifier = async (pkg: Pkg, fromFile: string, specifier: string): Promise<string | undefined> => {
  let base: string | undefined
  if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else if (specifier === pkg.name) base = pkg.entry
  else if (specifier.startsWith(`${pkg.name}/`)) {
    const subpath = specifier.slice(pkg.name.length + 1)
    base = exportedSubpath(pkg, subpath) ?? resolve(join(pkg.dir, 'src'), subpath)
  }
  if (base === undefined) return undefined
  const stem = base.replace(SOURCE_EXT, '')
  const candidates = [
    ...MODULE_SUFFIXES.map((suffix) => stem + suffix),
    join(stem, 'index.ts'),
    join(stem, 'mod.ts'),
    base,
  ]
  for (const candidate of candidates) {
    if (inside(candidate, join(pkg.dir, 'src')) && await exists(candidate)) return candidate
  }
  return undefined
}

/** The value identifiers inside an expression tree; a type position is not a reference. */
const valueReferences = (root: Node): readonly Identifier[] => {
  const found: Identifier[] = []
  const visit = (node: Node): void => {
    if (isTypeNode(node)) return
    if (isIdentifier(node)) {
      found.push(node)
      return
    }
    node.forEachChild(visit)
  }
  visit(root)
  return found
}

/** The expression a reached declaration evaluates: an initializer or a body, per declaration kind. */
const declarationBody = (node: Node): Node | undefined => {
  if (isVariableDeclaration(node) || isPropertyAssignment(node) || isPropertyDeclaration(node)) {
    return node.initializer
  }
  if (
    isFunctionDeclaration(node) || isFunctionExpression(node) || isArrowFunction(node) || isMethodDeclaration(node)
  ) {
    return node.body
  }
  return undefined
}

/** The declaration a symbol names, following a shorthand property back to the value it stands for. */
const valueDeclarationOf = async (
  checker: Checker,
  project: Project,
  symbol: Symbol,
): Promise<ReachedDeclaration | undefined> => {
  const declaration = symbol.valueDeclaration
  if (declaration === undefined) return undefined
  if (declaration.kind !== SyntaxKind.ShorthandPropertyAssignment) {
    return { handle: declaration, file: declaration.path }
  }
  const node = await declaration.resolve(project)
  if (node === undefined || !isShorthandPropertyAssignment(node) || !isIdentifier(node.name)) {
    return { handle: declaration, file: declaration.path }
  }
  const outer = await checker.resolveName(node.name.text, SymbolFlags.Value, node)
  if (outer === undefined) return { handle: declaration, file: declaration.path }
  const resolved = await resolveAlias(checker, outer)
  const root = resolved.valueDeclaration
  if (root === undefined) return { handle: declaration, file: declaration.path }
  return { handle: root, file: root.path }
}

/** The declaration an identifier names when the program cannot resolve its import (a bare subpath). */
const unresolvedTarget = async (
  pkg: Pkg,
  checker: Checker,
  program: Program,
  reference: Identifier,
): Promise<ReachedDeclaration | undefined> => {
  const file = reference.getSourceFile()
  for (const statement of file.statements) {
    if (!isImportDeclaration(statement) || !isStringLiteral(statement.moduleSpecifier)) continue
    const named = statement.importClause?.namedBindings
    if (named === undefined || !isNamedImports(named)) continue
    if (!named.elements.some((element) => element.name.text === reference.text)) continue
    const target = await resolveSpecifier(pkg, file.fileName, statement.moduleSpecifier.text)
    if (target === undefined) continue
    const targetFile = await program.getSourceFile(target)
    if (targetFile === undefined) continue
    const moduleSymbol = await checker.getSymbolAtLocation(targetFile)
    if (moduleSymbol === undefined) continue
    const exported = (await checker.getExportsOfModule(moduleSymbol)).find((symbol) => symbol.name === reference.text)
    if (exported === undefined) continue
    const declaration = exported.valueDeclaration
    if (declaration === undefined || !inside(declaration.path, pkg.dir)) continue
    return { handle: declaration, file: declaration.path }
  }
  return undefined
}

/** The modules a stop check links: the declarations it reaches, followed within the package. */
const linkedDeclarations = async (
  pkg: Pkg,
  checker: Checker,
  program: Program,
  project: Project,
  unitDeclarationKeys: ReadonlySet<string>,
  seeds: readonly ReachedDeclaration[],
): Promise<ReadonlySet<string>> => {
  const linked = new Set<string>()
  const queue: ReachedDeclaration[] = [...seeds]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const reached = queue.pop()
    if (reached === undefined) continue
    const key = `${reached.file}:${reached.handle.index}`
    if (visited.has(key)) continue
    visited.add(key)
    const node = await reached.handle.resolve(project)
    if (node === undefined) continue
    if (unitDeclarationKeys.has(`${reached.file}:${node.pos}`)) linked.add(reached.file)
    const body = declarationBody(node)
    if (body === undefined) continue
    for (const reference of valueReferences(body)) {
      const symbol = await checker.getSymbolAtLocation(reference)
      const resolved = symbol === undefined ? undefined : await resolveAlias(checker, symbol)
      if (resolved !== undefined && !(await checker.isUnknownSymbol(resolved))) {
        const declaration = await valueDeclarationOf(checker, project, resolved)
        if (declaration !== undefined && inside(declaration.file, pkg.dir)) queue.push(declaration)
        continue
      }
      const fallback = await unresolvedTarget(pkg, checker, program, reference)
      if (fallback !== undefined) queue.push(fallback)
    }
  }
  return linked
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
      const unrouted: string[] = []
      let enrolled = 0
      let direct = 0
      let transitive = 0
      for (const pkg of pkgs) {
        const modules = await enrollModules(root, pkg, checker, program, units)
        enrolled += modules.length
        const unitDeclarationKeys = new Set(modules.flatMap((module) => module.decls.map((decl) => decl.key)))
        const handed = await handedDeclarations(pkg, checker, program, project)
        const linked = await linkedDeclarations(pkg, checker, program, project, unitDeclarationKeys, handed.decls)
        let linkedHere = 0
        for (const module of modules) {
          if (handed.files.has(module.absolute)) {
            direct++
            linkedHere++
          } else if (linked.has(module.absolute)) {
            transitive++
            linkedHere++
          } else {
            violations.push(
              `${module.pkg} ${module.file}: has no stop rule (${module.decls.map((decl) => decl.name).join(', ')})`,
            )
          }
        }
        if (linkedHere > 0 && !runsConformanceProject(pkg.test)) {
          unrouted.push(`${pkg.name}: its test script never runs the conformance project`)
        }
      }
      violations.sort()
      unrouted.sort()
      return {
        enrolled,
        linked: direct + transitive,
        direct,
        transitive,
        packages: pkgs.length,
        violations,
        unrouted,
      }
    } finally {
      await snapshot?.dispose()
      await api.close()
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
}

const projectNames = (script: string): readonly string[] | undefined => {
  const names = [...script.matchAll(/--project(?:=|\s+)([^\s=]+)/g)].map((match) => match[1])
  return names.length === 0 ? undefined : names
}

const runsConformanceProject = (test: string | undefined): boolean => {
  if (test === undefined) return true
  const names = projectNames(test)
  return names === undefined || names.includes('conformance')
}

const main = async (): Promise<number> => {
  const { enrolled, linked, direct, transitive, packages, violations, unrouted } = await run(Deno.cwd())
  const breakdown = `${direct} linked directly, ${transitive} reached through declarations`
  if (unrouted.length > 0) {
    console.error(
      `stop enrollment: ${unrouted.length} package(s) with linked stop checks never run the conformance project:`,
    )
    console.error('')
    for (const name of unrouted) console.error(name)
    console.error('')
  }
  if (violations.length > 0) {
    console.error(
      `stop enrollment: ${violations.length} of ${enrolled} enrolled module(s) have no stop rule, across ${packages} package(s) (${breakdown}):`,
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
  if (unrouted.length > 0) return 1
  console.log(
    `stop enrollment: ${enrolled} enrolled module(s), ${linked} with a stop rule (${breakdown}), across ${packages} package(s)`,
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

const pkgJson = (name: string, scripts?: Readonly<Record<string, string>>): string =>
  JSON.stringify({
    name,
    type: 'module',
    exports: { '.': { '@systemfsoftware/source': './src/mod.ts' } },
    ...(scripts === undefined ? {} : { scripts }),
  }) + '\n'

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
const SANDWICH_SOURCE = `import { type Cell, id } from './Cell.js'
export type WrittenCell<I> = Cell<I> & { readonly phases: readonly string[] }
export interface DecidedChain<I> {
  readonly 'sentence: must write after decide': true
  write(handlers: object): WrittenCell<I>
}
export interface ReadChain<I> {
  readonly 'sentence: must decide after read': true
  decide(workflow: unknown): DecidedChain<I>
}
export const named = (_name: string) =>
<I,>(_read: (command: I) => unknown): ReadChain<I> => ({
  'sentence: must decide after read': true as const,
  decide: (_workflow: unknown) => ({
    'sentence: must write after decide': true as const,
    write: (_handlers: object): WrittenCell<I> => ({ ...id<I>(), phases: ['read'] }),
  }),
})
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
  'pkgs/effect-cell-types/src/Sandwich.ts': SANDWICH_SOURCE,
  'pkgs/effect-cell-types/src/mod.ts':
    "export * from './Cell.js'\nexport * from './Blueprint.js'\nexport * from './Handle.js'\nexport * from './Sandwich.js'\n",
  'pkgs/effect-daemon-spec/package.json': pkgJson('@systemfsoftware/effect-daemon-spec'),
  'pkgs/effect-daemon-spec/src/Supervisor/Medium.ts': MEDIUM_SOURCE,
  'pkgs/effect-daemon-spec/src/mod.ts': "export * from './Supervisor/Medium.js'\n",
  'pkgs/conformance-spec/package.json': pkgJson('@systemfsoftware/conformance-spec'),
  'pkgs/conformance-spec/src/Conformance/mod.ts':
    'export const stopped = (_unit: unknown): void => {}\nexport const released = (_program: unknown): void => {}\n',
  'pkgs/conformance-spec/src/mod.ts': "export * as Conformance from './Conformance/mod.js'\n",
  'pkgs/no-src/package.json': pkgJson('@systemfsoftware/no-src'),
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

      'pkgs/no-units/package.json': pkgJson('@systemfsoftware/no-units', { test: 'vitest run --project unit' }),
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

      'pkgs/pub-private/package.json': pkgJson('@systemfsoftware/pub-private', { test: 'vitest run --project unit' }),
      'pkgs/pub-private/src/private.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell<number> = id<number>()\n",
      'pkgs/pub-private/src/mod.ts':
        "import { type Blueprint, type Cell, id } from '@systemfsoftware/effect-cell-types'\nimport { hiddenCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst cell: Cell<number> = hiddenCell\nconst Widget: Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { cell, Widget }\n",
      'pkgs/pub-private/tests/pub.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",

      'pkgs/pub-type-only/package.json': pkgJson('@systemfsoftware/pub-type-only'),
      'pkgs/pub-type-only/src/private.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell<number> = id<number>()\n",
      'pkgs/pub-type-only/src/mod.ts':
        "import { type Blueprint } from '@systemfsoftware/effect-cell-types'\nimport type { hiddenCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport type Hidden = typeof hiddenCell\nexport { Widget }\n",
      'pkgs/pub-type-only/tests/pub.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",

      'pkgs/orphan-private/package.json': pkgJson('@systemfsoftware/orphan-private', {
        test: 'vitest run --project unit --project conformance',
      }),
      'pkgs/orphan-private/src/private.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const hiddenCell: Cell<number> = id<number>()\n",
      'pkgs/orphan-private/src/mod.ts':
        "import { type Blueprint } from '@systemfsoftware/effect-cell-types'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { Widget }\n",
      'pkgs/orphan-private/tests/pub.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",

      'pkgs/other-units/package.json': pkgJson('@systemfsoftware/other-units'),
      'pkgs/other-units/src/mod.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const otherCell: Cell<number> = id<number>()\n",
      'pkgs/cross/package.json': pkgJson('@systemfsoftware/cross'),
      'pkgs/cross/src/mod.ts':
        "import { type Blueprint } from '@systemfsoftware/effect-cell-types'\nimport { otherCell } from '@systemfsoftware/other-units'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { Widget, otherCell }\n",
      'pkgs/cross/tests/cross.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",

      'pkgs/chain/package.json': pkgJson('@systemfsoftware/chain'),
      'pkgs/chain/src/leaf.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const leafCell: Cell<number> = id<number>()\n",
      'pkgs/chain/src/middle.ts':
        "import { type Cell } from '@systemfsoftware/effect-cell-types'\nimport { leafCell } from './leaf.js'\nexport const middleCell: Cell<number> = leafCell\n",
      'pkgs/chain/src/mod.ts':
        "import { type Cell } from '@systemfsoftware/effect-cell-types'\nimport { middleCell } from './middle.js'\nconst wiring = { middleCell }\nexport const topCell: Cell<number> = wiring.middleCell\n",
      'pkgs/chain/tests/chain.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { topCell } from '../src/mod.js'\nConformance.stopped(topCell)\n",

      'pkgs/imported-unused/package.json': pkgJson('@systemfsoftware/imported-unused'),
      'pkgs/imported-unused/src/private.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const unusedCell: Cell<number> = id<number>()\n",
      'pkgs/imported-unused/src/mod.ts':
        "import { type Blueprint } from '@systemfsoftware/effect-cell-types'\nimport { unusedCell } from './private.js'\nconst WidgetId: unique symbol = Symbol.for('test/Widget')\nconst Widget: Blueprint<typeof WidgetId, { n: number }> = { typeId: WidgetId, spec: { n: 1 } }\nexport { Widget }\n",
      'pkgs/imported-unused/tests/imported.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { Widget } from '../src/mod.js'\nConformance.stopped(Widget)\n",

      'pkgs/subpath/package.json': JSON.stringify({
        name: '@systemfsoftware/subpath',
        type: 'module',
        exports: {
          '.': { '@systemfsoftware/source': './src/mod.ts' },
          './unit': { '@systemfsoftware/source': './src/unit.js' },
        },
      }) + '\n',
      'pkgs/subpath/src/unit.ts':
        "import { id, type Cell } from '@systemfsoftware/effect-cell-types'\nexport const subCell: Cell<number> = id<number>()\n",
      'pkgs/subpath/src/mod.ts':
        "import { type Cell } from '@systemfsoftware/effect-cell-types'\nimport { subCell } from '@systemfsoftware/subpath/unit'\nexport const top: Cell<number> = subCell\n",
      'pkgs/subpath/tests/sub.conformance.test.ts':
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { top } from '../src/mod.js'\nConformance.stopped(top)\n",

      'pkgs/cells/src/positive.ts':
        "import { named, id, type Cell } from '@systemfsoftware/effect-cell-types'\ndeclare const read: (command: number) => number\ndeclare const workflow: unknown\ndeclare const handlers: object\nexport const SandwichBuilt = named('op')(read).decide(workflow).write(handlers)\nexport const makeCell = (): Cell<number> => id<number>()\n",
    })

    const expected = [
      'pkgs/blueprint-not-suffixed pkgs/blueprint-not-suffixed/src/anything.ts: has no stop rule (Widget)',
      'pkgs/cells pkgs/cells/src/mod.ts: has no stop rule (SandwichCell, CombinatorCell)',
      'pkgs/cells pkgs/cells/src/positive.ts: has no stop rule (SandwichBuilt, makeCell)',
      'pkgs/imported-unused pkgs/imported-unused/src/private.ts: has no stop rule (unusedCell)',
      'pkgs/medium-unlinked pkgs/medium-unlinked/src/mod.ts: has no stop rule (build, UnlinkedMedium)',
      'pkgs/orphan-private pkgs/orphan-private/src/private.ts: has no stop rule (hiddenCell)',
      'pkgs/other-units pkgs/other-units/src/mod.ts: has no stop rule (otherCell)',
      'pkgs/private-blueprint pkgs/private-blueprint/src/mod.ts: has no stop rule (Window, make)',
      'pkgs/private-cell pkgs/private-cell/src/mod.ts: has no stop rule (hidden)',
      'pkgs/pub-private pkgs/pub-private/src/private.ts: has no stop rule (hiddenCell)',
      'pkgs/pub-type-only pkgs/pub-type-only/src/private.ts: has no stop rule (hiddenCell)',
      'pkgs/stop-outside pkgs/stop-outside/src/mod.ts: has no stop rule (LooseCell)',
      'pkgs/wrong-export pkgs/wrong-export/src/mod.ts: has no stop rule (WrongCell)',
    ].sort()
    const expectedUnrouted = [
      '@systemfsoftware/pub-private: its test script never runs the conformance project',
    ]

    const result = await run(wsRoot)
    if (JSON.stringify(result.violations) !== JSON.stringify(expected)) {
      failures.push(
        `  unlinked modules:\n    expected ${JSON.stringify(expected)}\n    got      ${
          JSON.stringify(result.violations)
        }`,
      )
    }
    if (JSON.stringify(result.unrouted) !== JSON.stringify(expectedUnrouted)) {
      failures.push(`  unrouted packages:\n    got ${JSON.stringify(result.unrouted)}`)
    }
    if (result.enrolled !== 26 || result.linked !== 13 || result.direct !== 10 || result.transitive !== 3) {
      failures.push(
        `  counts: expected 26 enrolled / 13 linked (10 direct, 3 transitive), got ${result.enrolled} / ${result.linked} (${result.direct} direct, ${result.transitive} transitive)`,
      )
    }
    for (const kind of ['effect-cell-types/src/Cell.ts', 'pkgs/cells/src/sandwich.ts']) {
      const kinds = result.violations.filter((violation) => violation.includes(kind))
      if (kinds.length > 0) failures.push(`  a kind module was enrolled: ${JSON.stringify(kinds)}`)
    }

    const bareRoot = await Deno.makeTempDir({ prefix: 'stop-enrollment-zero-' })
    try {
      await plant(bareRoot, BRAND_FIXTURE)
      const bare = await run(bareRoot)
      if (bare.enrolled !== 0 || bare.violations.length !== 0 || bare.unrouted.length !== 0) {
        failures.push(
          `  zero enrolled: expected a pass with 0 modules, got enrolled=${bare.enrolled} violations=${
            JSON.stringify(bare.violations)
          } unrouted=${JSON.stringify(bare.unrouted)}`,
        )
      }
    } finally {
      await Deno.remove(bareRoot, { recursive: true }).catch(() => {})
    }

    const brokenRoot = await Deno.makeTempDir({ prefix: 'stop-enrollment-broken-' })
    try {
      await plant(brokenRoot, {
        ...BRAND_FIXTURE,
        'pkgs/broken/package.json': pkgJson('@systemfsoftware/broken'),
      })
      await Deno.writeTextFile(join(brokenRoot, 'pkgs/broken/src'), 'not a directory\n')
      try {
        await run(brokenRoot)
        failures.push('  unreadable src: expected the guard to fail, got a green run')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('cannot read') || !message.includes('pkgs/broken/src')) {
          failures.push(`  unreadable src: the failure does not name the path: ${message}`)
        }
      }
    } finally {
      await Deno.remove(brokenRoot, { recursive: true }).catch(() => {})
    }

    if (failures.length > 0) {
      console.error(`check-stop-enrollment: selftest FAILED (${failures.length})\n`)
      for (const failure of failures) console.error(failure)
      return 1
    }
    console.log(
      `check-stop-enrollment: selftest ok (${expected.length} unlinked modules named, ${result.unrouted.length} unrouted package(s), ${result.enrolled} enrolled, ${result.linked} linked)`,
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
