import type { ESTree } from '@oxlint/plugins'

/**
 * The import-origin resolver this plugin's suffix-keyed rules reason through.
 *
 * The defect it closes: matching a callee by the way it is spelled
 * (`Blueprint.make`) instead of resolving where the identifier comes from. A
 * namespace import (`import * as CellTypes from
 * '@systemfsoftware/effect-cell-types'`), an alias (`import { Blueprint as B }`),
 * a destructure (`const { make } = Blueprint`), and a computed member key
 * (`Blueprint['make']`) all name the same origin; a same-spelled callee imported
 * from anywhere else resolves to nothing. Keys are origins, never spellings.
 *
 * Resolution is module-scope: the seed is the file's top-level imports plus the
 * aliases they flow through. That is the scope a blueprint or handle module's
 * kinds live in — they are imports, not parameters. `moduleOriginsWithCallResultsOf`
 * adds a call-result pass for the rule that must follow a factory through
 * `const x = setup(...)`; the suffix-keyed rules read `moduleOriginsOf`, whose
 * verdicts that pass leaves alone.
 */

export const EFFECT_CELL_TYPES_SOURCE = '@systemfsoftware/effect-cell-types'
export const EFFECT_SOURCE = 'effect'
export const EFFECT_CONTEXT_MODULE = 'effect/Context'
export const PIPEABLE_MODULE = 'effect/Pipeable'
export const REF_MODULE = 'effect/Ref'
export const MUTABLE_REF_MODULE = 'effect/MutableRef'

/** The kind a `@systemfsoftware/effect-cell-types` constructor mints. */
export type CellKind = 'blueprint' | 'handle'

export interface ModuleOrigin {
  /** The module specifier exactly as the import declaration writes it. */
  readonly source: string
  /** The member path the expression denotes (`CellTypes.Blueprint.make` → `['Blueprint', 'make']`). */
  readonly members: readonly string[]
}

export type ModuleOrigins = ReadonlyMap<string, ModuleOrigin>

const CELL_KIND_BY_MEMBER_PATH: Readonly<Record<string, CellKind>> = {
  'Blueprint.make': 'blueprint',
  'Handle.make': 'handle',
}

interface NamedNode {
  readonly name: string
}

const isNamed = (node: ESTree.Node): node is ESTree.Node & NamedNode => node.type === 'Identifier'

/** The declared name of a binding, property key, or module export name. */
export const staticNameOf = (node: ESTree.Node): string | null => {
  if (isNamed(node)) return node.name
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  return null
}

const TS_EXPRESSION_WRAPPERS: Readonly<Record<string, true>> = {
  TSAsExpression: true,
  TSSatisfiesExpression: true,
  TSNonNullExpression: true,
  TSTypeAssertion: true,
  TSInstantiationExpression: true,
}

const isExpressionWrapper = (node: ESTree.Node): node is ESTree.Node & { readonly expression: ESTree.Node } =>
  TS_EXPRESSION_WRAPPERS[node.type] === true

export const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

/**
 * The statically known string an expression spells: a string literal, or a
 * template with no substitutions (`` `@systemfsoftware/xstate/fsm` `` names the
 * same specifier as its literal spelling). Everything else is `null` — the
 * module specifier is never guessed.
 */
export const literalStringOf = (wrapped: ESTree.Node): string | null => {
  const node = unwrapExpression(wrapped)
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  return null
}

const memberNameOf = (node: ESTree.MemberExpression): string | null =>
  node.computed ? staticNameOf(node.property) : isNamed(node.property) ? node.property.name : null

const resolveNode = (
  wrapped: ESTree.Node,
  origins: ModuleOrigins,
  callResults: boolean,
): ModuleOrigin | null => {
  const node = unwrapExpression(wrapped)
  if (isNamed(node)) return origins.get(node.name) ?? null
  // A call result denotes what its callee denotes: the value a factory builds
  // is not a new origin, so `const x = setup(...)` and
  // `const { createFSM } = setup(...)` resolve through the origin of `setup`
  // (and, one member on, through `setup.createFSM`). Only the call-result seed
  // asks for this: the suffix-keyed rules read the module-scope seed alone, so
  // their verdicts do not move.
  if (node.type === 'CallExpression') {
    return callResults ? resolveNode(node.callee, origins, callResults) : null
  }
  if (node.type !== 'MemberExpression') return null
  const base = resolveNode(node.object, origins, callResults)
  if (base === null) return null
  const member = memberNameOf(node)
  if (member === null) return null
  return base.members.length === 0
    ? { source: base.source, members: [member] }
    : { source: base.source, members: [...base.members, member] }
}

const seedImports = (program: ESTree.Program, into: Map<string, ModuleOrigin>): void => {
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    const source = statement.source.value
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const imported = staticNameOf(specifier.imported) ?? specifier.local.name
        into.set(specifier.local.name, { source, members: [imported] })
        continue
      }
      if (specifier.type === 'ImportNamespaceSpecifier') {
        into.set(specifier.local.name, { source, members: [] })
        continue
      }
      into.set(specifier.local.name, { source, members: ['default'] })
    }
  }
}

interface AliasCandidate {
  readonly id: ESTree.BindingPattern
  readonly init: ESTree.Node
}

const aliasCandidatesOf = (program: ESTree.Program): readonly AliasCandidate[] => {
  const candidates: AliasCandidate[] = []
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration === null || declaration.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      if (declarator.init !== null) candidates.push({ id: declarator.id, init: declarator.init })
    }
  }
  return candidates
}

const seedAliases = (program: ESTree.Program, into: Map<string, ModuleOrigin>, callResults: boolean): void => {
  const candidates = aliasCandidatesOf(program)
  for (let hop = 0; hop < 8; hop += 1) {
    let grew = false
    for (const candidate of candidates) {
      const base = resolveNode(candidate.init, into, callResults)
      if (base === null) continue
      if (candidate.id.type === 'Identifier') {
        if (into.has(candidate.id.name)) continue
        into.set(candidate.id.name, base)
        grew = true
        continue
      }
      if (candidate.id.type !== 'ObjectPattern') continue
      for (const property of candidate.id.properties) {
        if (property.type !== 'Property' || property.value.type !== 'Identifier') continue
        const member = staticNameOf(property.key)
        if (member === null || into.has(property.value.name)) continue
        into.set(property.value.name, {
          source: base.source,
          members: base.members.length === 0 ? [member] : [...base.members, member],
        })
        grew = true
      }
    }
    if (!grew) break
  }
}

/** The module-scope binding origins of a program: its imports and the aliases they flow through. */
export const moduleOriginsOf = (program: ESTree.Program): ModuleOrigins => {
  const origins = new Map<string, ModuleOrigin>()
  seedImports(program, origins)
  seedAliases(program, origins, false)
  return origins
}

/**
 * The same origins with a call-result pass: a binding whose initializer is a
 * call takes the origin of the call's callee, so `const x = setup(...)` and
 * `const { createFSM } = setup(...)` resolve through `setup` — and, one member
 * on, through `setup.createFSM`. The suffix-keyed rules keep reading
 * `moduleOriginsOf`, whose verdicts this pass must not move: a `Handle.make`
 * result aliased through a call is a construction there, and a guard taken off
 * it (`RunningContainer.is`) is not.
 */
export const moduleOriginsWithCallResultsOf = (program: ESTree.Program): ModuleOrigins => {
  const origins = new Map<string, ModuleOrigin>()
  seedImports(program, origins)
  seedAliases(program, origins, true)
  return origins
}

export const originOf = (node: ESTree.Node, origins: ModuleOrigins): ModuleOrigin | null =>
  resolveNode(node, origins, false)

/** The origin of an expression whose callee chain includes a call result (`setup(...).createFSM`). */
export const originWithCallResultsOf = (node: ESTree.Node, origins: ModuleOrigins): ModuleOrigin | null =>
  resolveNode(node, origins, true)

/** The dotted member path an origin denotes (`['Blueprint', 'make']` → `'Blueprint.make'`). */
export const memberPathOf = (origin: ModuleOrigin): string => origin.members.join('.')

/** The callee at the root of a call chain: `Handle.make<D>()(TypeId)` → `Handle.make`. */
export const calleeRootOf = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (current.type === 'CallExpression') current = current.callee
  return current
}

export const kindOfOrigin = (origin: ModuleOrigin | null): CellKind | null => {
  if (origin === null || origin.source !== EFFECT_CELL_TYPES_SOURCE) return null
  return CELL_KIND_BY_MEMBER_PATH[memberPathOf(origin)] ?? null
}

const constructionKindOf = (node: ESTree.Node, origins: ModuleOrigins): CellKind | null => {
  const direct = kindOfOrigin(originOf(calleeRootOf(node), origins))
  if (direct !== null) return direct
  if (node.type === 'CallExpression') return constructionKindOf(node.callee, origins)
  if (node.type === 'MemberExpression') return constructionKindOf(node.object, origins)
  return null
}

export const kindOfConstruction = (node: ESTree.Node, origins: ModuleOrigins): CellKind | null =>
  constructionKindOf(node, origins)

export const isModuleMember = (
  node: ESTree.Node,
  origins: ModuleOrigins,
  source: string,
  memberPath: string,
): boolean => {
  const origin = originOf(node, origins)
  return origin !== null && origin.source === source && memberPathOf(origin) === memberPath
}
