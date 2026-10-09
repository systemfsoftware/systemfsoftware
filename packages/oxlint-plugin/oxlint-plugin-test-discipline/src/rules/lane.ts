import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  CONFORMANCE_PACKAGE,
  DIFFERENTIAL_PACKAGE,
  FOREIGN_RUNNERS,
  GHERKIN_PACKAGE,
  TRACE_SPEC_PACKAGE,
} from './path.config.js'
import { basenameOf, isTestFile } from './path.js'
import { isPropCallee } from './prop-call.js'

/**
 * What a test exercises, read from what it imports and calls. A file is in every
 * lane its content selects, whatever its name or location (`CONST-T12`).
 */
export type Lane = 'behaviour' | 'conformance' | 'differential' | 'trace' | 'property'

export type Lanes = ReadonlySet<Lane>

const HARNESS_LANES: ReadonlyArray<readonly [string, Lane]> = [
  [GHERKIN_PACKAGE, 'behaviour'],
  [CONFORMANCE_PACKAGE, 'conformance'],
  [DIFFERENTIAL_PACKAGE, 'differential'],
  [TRACE_SPEC_PACKAGE, 'trace'],
]

const isPackageOrSubpath = (source: string, pkg: string): boolean => source === pkg || source.startsWith(`${pkg}/`)

/** The lane a harness import selects: the package itself or any subpath of it. */
export const harnessLaneOf = (source: string): Lane | undefined =>
  HARNESS_LANES.find(([pkg]) => isPackageOrSubpath(source, pkg))?.[1]

export const isTypeOnly = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  ))

/**
 * Where a value import brings FastCheck in: the whole declaration for the
 * `fast-check` module (or a subpath), else each `FastCheck` named value import.
 */
export const fastCheckImportSites = (node: ESTree.ImportDeclaration): ReadonlyArray<ESTree.Node> =>
  isTypeOnly(node) ? [] : isPackageOrSubpath(node.source.value, 'fast-check') ? [node] : node.specifiers.filter(
    (specifier) =>
      specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type' &&
      specifier.imported.type === 'Identifier' && specifier.imported.name === 'FastCheck',
  )

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

type VisitorKeys = Readonly<Record<string, readonly string[]>>

const childrenOf = (node: ESTree.Node, keys: VisitorKeys): readonly ESTree.Node[] =>
  (keys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key)
    if (Array.isArray(value)) return value.filter(isNode)
    return isNode(value) ? [value] : []
  })

const callsProperty = (program: ESTree.Program, keys: VisitorKeys): boolean => {
  const pending: ESTree.Node[] = [program]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.type === 'CallExpression' && isPropCallee(node.callee)) return true
    pending.push(...childrenOf(node, keys))
  }
  return false
}

const derive = (program: ESTree.Program, keys: VisitorKeys): Lanes => {
  const lanes = new Set<Lane>()
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || isTypeOnly(statement)) continue
    const lane = harnessLaneOf(statement.source.value)
    if (lane !== undefined) lanes.add(lane)
    if (fastCheckImportSites(statement).length > 0) lanes.add('property')
  }
  if (!lanes.has('property') && callsProperty(program, keys)) lanes.add('property')
  return lanes
}

const NO_LANES: Lanes = new Set()

const cache = new WeakMap<ESTree.Program, Lanes>()

/**
 * The lanes the linted test file is in, derived once per program and shared by
 * every rule. Only a file Vitest runs as a test (the `.test.ts` / `.spec.ts`
 * ending) is in a lane; a fixture or helper a test imports is not a test.
 * Call it from a visitor: the AST is complete once traversal starts.
 */
export const lanesOf = (context: Context): Lanes => {
  if (!isTestFile(basenameOf(context.filename))) return NO_LANES
  const program = context.sourceCode.ast
  const cached = cache.get(program)
  if (cached !== undefined) return cached
  const lanes = derive(program, context.sourceCode.visitorKeys)
  cache.set(program, lanes)
  return lanes
}

/**
 * The property lane holds a file only when no differential harness does: the
 * differential requirements already include the property ones, and a
 * differential file imports FastCheck for its arbitraries.
 */
export const isPropertyFile = (lanes: Lanes): boolean => lanes.has('property') && !lanes.has('differential')

/**
 * A property test beside Gherkin, conformance or trace scenarios: the property
 * belongs in its own workflow property file, never mixed into a harness test.
 */
export const mixesPropertyIntoAHarness = (lanes: Lanes): boolean =>
  isPropertyFile(lanes) && (lanes.has('behaviour') || lanes.has('conformance') || lanes.has('trace'))

/**
 * What a package is, declared in its own lint config: `vitest-runner` for the
 * packages that are the test framework itself. The rule cannot see how a package
 * is wired, so it takes the declaration at its word; a package that declares the
 * role without being the runner gets the runner's lane all the same, and the
 * declaration is reviewed where it is made, in the config diff.
 */
export const RoleOptions = S.Struct({ role: S.optional(S.Literal('vitest-runner')) })

export type RoleOptions = S.Schema.Type<typeof RoleOptions>

/** Whether the linted file's package declares itself the Vitest runner. */
export const isRunnerPackage = (context: Context): boolean =>
  S.decodeUnknownSync(RoleOptions)(context.options[0] ?? {}).role === 'vitest-runner'

const importsARunner = (program: ESTree.Program): boolean =>
  program.body.some((statement) =>
    statement.type === 'ImportDeclaration' && !isTypeOnly(statement) &&
    Object.keys(FOREIGN_RUNNERS).some((runner) => isPackageOrSubpath(statement.source.value, runner))
  )

/**
 * The runner lane: a test in a package that declares the `vitest-runner` role
 * and imports a Vitest runner module (`vitest`, `@effect/vitest`, the fork, or a
 * subpath of one). Outside such a package the same imports select no lane.
 */
export const isInRunnerLane = (context: Context): boolean =>
  isTestFile(basenameOf(context.filename)) && isRunnerPackage(context) && importsARunner(context.sourceCode.ast)
