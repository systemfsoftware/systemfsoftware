import type { Context, ESTree } from '@oxlint/plugins'
import { CONFORMANCE_PACKAGE, DIFFERENTIAL_PACKAGE, GHERKIN_PACKAGE, TRACE_SPEC_PACKAGE } from './path.config.js'
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

const isTypeOnly = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  ))

const importsFastCheck = (node: ESTree.ImportDeclaration): boolean =>
  isPackageOrSubpath(node.source.value, 'fast-check') || node.specifiers.some(
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
    if (importsFastCheck(statement)) lanes.add('property')
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
