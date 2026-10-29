import type { Context, ESTree } from '@oxlint/plugins'
import { Option, Schema as S } from 'effect'
import {
  CONFORMANCE_PACKAGE,
  DIFFERENTIAL_PACKAGE,
  E2E_RUNNER_ENTRY,
  FOREIGN_RUNNERS,
  GHERKIN_PACKAGE,
  TRACE_SPEC_PACKAGE,
} from './path.config.js'
import { basenameOf, isE2eTestFile, isTestFile } from './path.js'
import { isPropCallee } from './prop-call.js'

/**
 * What a test exercises, read from what it imports and calls. A file is in every
 * lane its content selects, whatever its name or location (`CONST-T12`).
 */
export type Lane = 'behaviour' | 'conformance' | 'differential' | 'trace' | 'property' | 'e2e'

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
 * Whether an import declaration registers end-to-end tests: it takes the
 * runner entry's `test` (an alias counts) or its namespace as a value. The
 * rest of the entry (`expect`, `describe`, hooks, the composition API, types)
 * registers no test, so importing it selects no lane.
 */
const importsE2eTest = (node: ESTree.ImportDeclaration): boolean =>
  node.source.value === E2E_RUNNER_ENTRY && node.specifiers.some(
    (specifier) =>
      specifier.type === 'ImportNamespaceSpecifier' ||
      (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type' &&
        specifier.imported.type === 'Identifier' && specifier.imported.name === 'test'),
  )

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
    if (importsE2eTest(statement)) lanes.add('e2e')
    if (fastCheckImportSites(statement).length > 0) lanes.add('property')
  }
  if (!lanes.has('property') && callsProperty(program, keys)) lanes.add('property')
  return lanes
}

const NO_LANES: Lanes = new Set()

const cache = new WeakMap<ESTree.Program, Lanes>()

/**
 * The lanes the linted test file is in, derived once per program and shared by
 * every rule. A file is in a lane when Vitest runs it as a test (the `.test.ts` /
 * `.spec.ts` ending) or the `effect-e2e` runner collects it (`isE2eTestFile`);
 * a fixture or helper a test imports is not a test.
 * Call it from a visitor: the AST is complete once traversal starts.
 */
export const lanesOf = (context: Context): Lanes => {
  if (!isTestFile(basenameOf(context.filename)) && !isE2eTestFile(context.filename)) return NO_LANES
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
 * What a package is, declared once in its own lint config's `settings`:
 * `vitest-runner` for the packages that are the test framework itself, `e2e`
 * for the packages that hold end-to-end suites. Every rule reads the same
 * declaration, so two rules can never disagree about it, and no rule takes a
 * role option (oxlint refuses one as a configuration error). The rule cannot
 * see how a package is wired, so it takes the declaration at its word; a
 * package that declares a role without being what it names gets that role's
 * treatment all the same, and the declaration is reviewed where it is made, in
 * the config diff.
 */
export const SETTINGS_KEY = '@systemfsoftware/oxlint-plugin-test-discipline'

const Role = S.Literals(['vitest-runner', 'e2e'])

const PluginSettings = S.Struct({
  [SETTINGS_KEY]: S.optional(S.Struct({ role: S.optional(Role) })),
})

const declaresRole = (context: Context, role: typeof Role.Type): boolean =>
  Option.exists(
    S.decodeUnknownOption(PluginSettings)(context.settings),
    (settings) => settings[SETTINGS_KEY]?.role === role,
  )

/**
 * Whether the linted file's package declares itself the Vitest runner. Settings
 * that do not decode declare no role, so every raw Vitest import is then refused.
 */
export const isRunnerPackage = (context: Context): boolean => declaresRole(context, 'vitest-runner')

/**
 * Whether the linted file's package declares itself an end-to-end package.
 * Settings that do not decode declare no role.
 */
export const isE2ePackage = (context: Context): boolean => declaresRole(context, 'e2e')

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
