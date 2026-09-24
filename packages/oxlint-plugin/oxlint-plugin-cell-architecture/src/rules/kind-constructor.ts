import type { Context, ESTree } from '@oxlint/plugins'
import { originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

export type CellKind = 'resource' | 'handle'

export const EFFECT_CELL_TYPES_SOURCE = '@systemfsoftware/effect-cell-types'

const KIND_BY_MEMBER_SEQUENCE: Readonly<Record<string, CellKind>> = {
  'Resource.make': 'resource',
  'Handle.make': 'handle',
}

const staticMemberNameOf = (node: ESTree.Node): string | null => {
  if (node.type !== 'MemberExpression') return null
  const property = node.property
  if (property.type === 'Identifier') return property.name
  return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
}

const literalStringOf = (node: ESTree.Node): string | null =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : null

const dynamicImportSourceOf = (node: ESTree.Node): string | null => {
  if (node.type === 'AwaitExpression') return dynamicImportSourceOf(node.argument)
  if (node.type !== 'ImportExpression') return null
  return literalStringOf(node.source)
}

const importedNameOfPatternKey = (
  property: { readonly key: ESTree.Node; readonly computed: boolean },
): string | null => {
  if (property.computed === false && property.key.type === 'Identifier') return property.key.name
  return literalStringOf(property.key)
}

const seedBindingsOfDeclarator = (declarator: ESTree.VariableDeclarator, into: Map<string, ImportOrigin>): void => {
  if (declarator.init === null) return
  const source = dynamicImportSourceOf(declarator.init)
  if (source === null) return
  const id = declarator.id
  if (id.type === 'Identifier') {
    into.set(id.name, { source, importedName: null, path: [] })
    return
  }
  if (id.type !== 'ObjectPattern') return
  for (const property of id.properties) {
    if (property.type !== 'Property' || property.value.type !== 'Identifier') continue
    const importedName = importedNameOfPatternKey(property)
    if (importedName === null) continue
    into.set(property.value.name, { source, importedName, path: [] })
  }
}

const collectDynamicBindings = (program: ESTree.Program): ReadonlyMap<string, ImportOrigin> => {
  const bindings = new Map<string, ImportOrigin>()
  const aliases: Array<{ readonly name: string; readonly init: ESTree.Node }> = []
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration === null || declaration.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations) {
      seedBindingsOfDeclarator(declarator, bindings)
      if (declarator.id.type === 'Identifier' && declarator.init !== null) {
        aliases.push({ name: declarator.id.name, init: declarator.init })
      }
    }
  }
  for (let hop = 0; hop < 8; hop += 1) {
    let grew = false
    for (const alias of aliases) {
      if (alias.init.type !== 'Identifier' || bindings.has(alias.name)) continue
      const base = bindings.get(alias.init.name)
      if (base === undefined) continue
      bindings.set(alias.name, base)
      grew = true
    }
    if (grew === false) break
  }
  return bindings
}

const dynamicOriginOf = (node: ESTree.Node, bindings: ReadonlyMap<string, ImportOrigin>): ImportOrigin | null => {
  if (node.type === 'Identifier') return bindings.get(node.name) ?? null
  if (node.type !== 'MemberExpression') return null
  const member = staticMemberNameOf(node)
  if (member === null) return null
  const receiver = dynamicOriginOf(node.object, bindings)
  if (receiver === null) return null
  return receiver.importedName === null
    ? { ...receiver, importedName: member }
    : { ...receiver, path: [...receiver.path, member] }
}

const kindOfSequence = (members: readonly string[]): CellKind | null =>
  KIND_BY_MEMBER_SEQUENCE[members.join('.')] ?? null

const kindOfOrigin = (origin: ImportOrigin): CellKind | null =>
  origin.source === EFFECT_CELL_TYPES_SOURCE ? kindOfSequence(originMemberSequence(origin)) : null

export interface CellOriginResolver {
  readonly kindOf: (node: ESTree.Node) => CellKind | null
}

export const cellOriginResolverOf = (context: Context): CellOriginResolver => {
  const bindings = collectDynamicBindings(context.sourceCode.ast)
  const originOf = (node: ESTree.Node): ImportOrigin | null =>
    resolveImportOrigin(node, context.sourceCode.getScope) ?? dynamicOriginOf(node, bindings)
  return {
    kindOf: (node) => {
      const origin = originOf(node)
      return origin === null ? null : kindOfOrigin(origin)
    },
  }
}
