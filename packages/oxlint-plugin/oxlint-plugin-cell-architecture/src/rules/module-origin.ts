import type { ESTree } from '@oxlint/plugins'

/**
 * The import-origin resolver this plugin's suffix-keyed rules reason through.
 *
 * The defect it closes: matching a callee by the way it is spelled
 * (`Resource.make`) instead of resolving where the identifier comes from. A
 * namespace import (`import * as CellTypes from
 * '@systemfsoftware/effect-cell-types'`), an alias (`import { Resource as R }`),
 * a destructure (`const { make } = Resource`), and a computed member key
 * (`Resource['make']`) all name the same origin; a same-spelled callee imported
 * from anywhere else resolves to nothing. Keys are origins, never spellings.
 *
 * Resolution is module-scope: the seed is the file's top-level imports plus the
 * aliases they flow through. That is the scope a resource or handle module's
 * kinds live in — they are imports, not parameters.
 */

export const EFFECT_CELL_TYPES_SOURCE = '@systemfsoftware/effect-cell-types'
export const EFFECT_SOURCE = 'effect'
export const EFFECT_CONTEXT_MODULE = 'effect/Context'
export const PIPEABLE_MODULE = 'effect/Pipeable'
export const REF_MODULE = 'effect/Ref'
export const MUTABLE_REF_MODULE = 'effect/MutableRef'

/** The kind a `@systemfsoftware/effect-cell-types` constructor mints. */
export type CellKind = 'resource' | 'handle'

export interface ModuleOrigin {
  /** The module specifier exactly as the import declaration writes it. */
  readonly source: string
  /** The member path the expression denotes (`CellTypes.Resource.make` → `['Resource', 'make']`). */
  readonly members: readonly string[]
}

export type ModuleOrigins = ReadonlyMap<string, ModuleOrigin>

const CELL_KIND_BY_MEMBER_PATH: Readonly<Record<string, CellKind>> = {
  'Resource.make': 'resource',
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

const memberNameOf = (node: ESTree.MemberExpression): string | null =>
  node.computed ? staticNameOf(node.property) : isNamed(node.property) ? node.property.name : null

const resolveNode = (node: ESTree.Node, origins: ModuleOrigins): ModuleOrigin | null => {
  if (isNamed(node)) return origins.get(node.name) ?? null
  if (node.type !== 'MemberExpression') return null
  const base = resolveNode(node.object, origins)
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

const seedAliases = (program: ESTree.Program, into: Map<string, ModuleOrigin>): void => {
  const candidates = aliasCandidatesOf(program)
  for (let hop = 0; hop < 8; hop += 1) {
    let grew = false
    for (const candidate of candidates) {
      const base = resolveNode(candidate.init, into)
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
  seedAliases(program, origins)
  return origins
}

export const originOf = (node: ESTree.Node, origins: ModuleOrigins): ModuleOrigin | null => resolveNode(node, origins)

/** The dotted member path an origin denotes (`['Resource', 'make']` → `'Resource.make'`). */
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

/** The kind a call constructs, resolved through the import — never through the callee's spelling. */
export const kindOfConstruction = (node: ESTree.Node, origins: ModuleOrigins): CellKind | null =>
  kindOfOrigin(originOf(calleeRootOf(node), origins))

export const isModuleMember = (
  node: ESTree.Node,
  origins: ModuleOrigins,
  source: string,
  memberPath: string,
): boolean => {
  const origin = originOf(node, origins)
  return origin !== null && origin.source === source && memberPathOf(origin) === memberPath
}
