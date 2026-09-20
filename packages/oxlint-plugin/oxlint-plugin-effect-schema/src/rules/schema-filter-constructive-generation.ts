import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  CHECK_SITE_NAME,
  EXPORTED_FIX,
  EXPORTED_NAME,
  meta,
  MISSING_ACTUAL,
  MISSING_EXPECTED,
  MISSING_FIX,
} from './schema-filter-constructive-generation.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'filterDiscards'

type GetScope = (node: ESTree.Node) => unknown
type IdentifierNode = Extract<ESTree.Node, { type: 'Identifier' }>
type PropertyNode = Extract<ESTree.Node, { type: 'Property' }>

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly type: string; readonly node: ESTree.Node }[] }>
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

const isNotSpread = (node: ESTree.Node | ESTree.SpreadElement): node is ESTree.Node => node.type !== 'SpreadElement'

const vocabularyMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin) ?? null
}

const objectPropertyOf = (object: ESTree.Node, key: string): PropertyNode | null => {
  if (object.type !== 'ObjectExpression') return null
  for (const property of object.properties) {
    if (property.type !== 'Property' || property.computed) continue
    if (property.key.type === 'Identifier' && property.key.name === key) return property
  }
  return null
}

const hasSpread = (object: ESTree.ObjectExpression): boolean =>
  object.properties.some((property) => property.type === 'SpreadElement')

const FILTER_CONSTRAINT_KEYS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minSize',
  'maxSize',
  'minProperties',
  'maxProperties',
  'patterns',
  'number',
  'uniqueBy',
  'order',
] as const

const constraintObjectVerdict = (value: ESTree.Node): 'yes' | 'no' | 'opaque' => {
  if (value.type !== 'ObjectExpression') return 'opaque'
  if (hasSpread(value)) return 'opaque'
  return FILTER_CONSTRAINT_KEYS.some((key) => objectPropertyOf(value, key) !== null) ? 'yes' : 'no'
}

const hasConstructiveMetadata = (annotations: ESTree.Node | null): 'yes' | 'no' | 'opaque' => {
  if (annotations === null) return 'no'
  if (annotations.type !== 'ObjectExpression') return 'opaque'
  const arbitraryConstraint = objectPropertyOf(annotations, 'arbitraryConstraint')
  if (arbitraryConstraint !== null) return constraintObjectVerdict(arbitraryConstraint.value)
  const arbitrary = objectPropertyOf(annotations, 'arbitrary')
  if (arbitrary === null) return hasSpread(annotations) ? 'opaque' : 'no'
  const value = arbitrary.value
  if (value.type !== 'ObjectExpression') return 'no'
  if (objectPropertyOf(value, 'constraint') !== null) return 'yes'
  return hasSpread(value) ? 'opaque' : 'no'
}

const MAX_WALK_DEPTH = 32

const carriesNodeOverride = (node: ESTree.Node | null, depth: number): boolean => {
  if (node === null || depth > MAX_WALK_DEPTH) return false
  if (node.type === 'CallExpression') {
    if (
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'annotate'
    ) {
      const annotations = node.arguments[1] !== undefined ? node.arguments.find(isNotSpread) : node.arguments[0]
      if (annotations !== undefined && objectPropertyOf(annotations, 'toCodecArbitrary') !== null) return true
    }
    return carriesNodeOverride(node.callee.type === 'MemberExpression' ? node.callee.object : null, depth + 1)
  }
  if (node.type === 'MemberExpression') return carriesNodeOverride(node.object, depth + 1)
  return false
}

const localInitOf = (identifier: IdentifierNode, getScope: GetScope, node: ESTree.Node): ESTree.Node | null => {
  const scope = getScope(node)
  if (!isScopeLike(scope)) return null
  for (let current: ScopeLike | null = scope; current !== null; current = current.upper) {
    const variable = current.set.get(identifier.name)
    if (variable === undefined) continue
    for (const def of variable.defs) {
      if (def.type === 'ImportBinding') return null
      if (def.node.type === 'VariableDeclarator' && def.node.init !== null && def.node.init !== undefined) {
        return def.node.init
      }
    }
    return null
  }
  return null
}

/**
 * An override silences the gate only when the chain it rides on is a schema
 * chain: it bottoms out at the Schema vocabulary or at a local const whose
 * initializer is one. A foreign object that happens to have an `annotate`
 * method carrying a `toCodecArbitrary` key (`builder.annotate({ toCodecArbitrary })`)
 * never silences the gate — that shape is a silencer, not an override.
 */
const STRUCT_MEMBERS: Readonly<Record<string, true>> = {
  Struct: true,
  Record: true,
  TaggedStruct: true,
  TaggedRecord: true,
}

type TerminalKind = 'declare' | 'struct' | 'scalar' | null

const tracesToSchemaTerminal = (node: ESTree.Node | null, getScope: GetScope, depth: number): TerminalKind => {
  if (node === null || depth > MAX_WALK_DEPTH) return null
  if (node.type === 'CallExpression') {
    const member = vocabularyMemberOf(node.callee, getScope)
    if (member !== null) {
      if (member === 'declare') return 'declare'
      if (STRUCT_MEMBERS[member] === true) return 'struct'
      return 'scalar'
    }
    return tracesToSchemaTerminal(
      node.callee.type === 'MemberExpression' ? node.callee.object : null,
      getScope,
      depth + 1,
    )
  }
  if (node.type === 'MemberExpression') {
    const member = vocabularyMemberOf(node, getScope)
    if (member !== null) {
      if (member === 'declare') return 'declare'
      if (STRUCT_MEMBERS[member] === true) return 'struct'
      return 'scalar'
    }
    return tracesToSchemaTerminal(node.object, getScope, depth + 1)
  }
  if (node.type === 'Identifier') {
    const member = vocabularyMemberOf(node, getScope)
    if (member !== null) {
      if (member === 'declare') return 'declare'
      if (STRUCT_MEMBERS[member] === true) return 'struct'
      return 'scalar'
    }
    const init = localInitOf(node, getScope, node)
    return init !== null ? tracesToSchemaTerminal(init, getScope, depth + 1) : null
  }
  return null
}

const receiverHasOverride = (base: ESTree.Node | null, terminal: TerminalKind): boolean =>
  terminal === 'declare' && carriesNodeOverride(base, 0)

const reportFilter = (
  context: Context,
  filterCall: ESTree.CallExpression,
  name: string,
  terminal: TerminalKind,
  missingFix: string,
): void => {
  if (terminal === 'struct') return
  const second = filterCall.arguments[1]
  const annotations = second !== undefined && isNotSpread(second) ? second : null
  const verdict = hasConstructiveMetadata(annotations)
  if (verdict === 'yes' || verdict === 'opaque') return
  context.report({
    node: filterCall,
    messageId: 'filterDiscards',
    data: { name, expected: MISSING_EXPECTED, actual: MISSING_ACTUAL, fix: missingFix },
  })
}

const inspectCheckArgument = (
  context: Context,
  argument: ESTree.Node,
  getScope: GetScope,
  exportedNames: ReadonlySet<string>,
  terminal: TerminalKind,
): void => {
  let filterCall: ESTree.CallExpression | null = null
  if (argument.type === 'CallExpression' && argument.callee.type === 'MemberExpression') {
    const member = argument.callee.property
    if (
      member.type === 'Identifier' &&
      (member.name === 'makeFilter' || member.name === 'makeFilterGroup') &&
      vocabularyMemberOf(argument.callee, getScope) !== null
    ) {
      filterCall = argument
    }
  } else if (argument.type === 'Identifier') {
    const init = localInitOf(argument, getScope, argument)
    if (init !== null && init.type === 'CallExpression') {
      const member = vocabularyMemberOf(init.callee, getScope)
      if (member === 'makeFilter' || member === 'makeFilterGroup') {
        if (exportedNames.has(argument.name)) return
        filterCall = init
      }
    }
  }
  if (filterCall === null) return
  reportFilter(context, filterCall, CHECK_SITE_NAME, terminal, MISSING_FIX)
}

export const schemaFilterConstructiveGeneration = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    const exportedNames = new Set<string>()
    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ExportNamedDeclaration') continue
          const declaration = statement.declaration
          if (declaration !== null && declaration.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              if (declarator.id.type === 'Identifier') exportedNames.add(declarator.id.name)
            }
          }
          for (const specifier of statement.specifiers) {
            if (specifier.local.type === 'Identifier') exportedNames.add(specifier.local.name)
          }
        }
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier' || !exportedNames.has(node.id.name)) return
        const init = node.init
        if (init === null || init === undefined || init.type !== 'CallExpression') return
        const member = vocabularyMemberOf(init.callee, getScope)
        if (member !== 'makeFilter' && member !== 'makeFilterGroup') return
        reportFilter(context, init, EXPORTED_NAME, null, EXPORTED_FIX)
      },
      CallExpression(node: ESTree.CallExpression) {
        let receiverNode: ESTree.Node | null = null
        if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
          const property = node.callee.property
          if (property.type !== 'Identifier' || property.name !== 'check') return
          receiverNode = node.callee.object
        } else if (node.callee.type === 'Identifier') {
          if (vocabularyMemberOf(node.callee, getScope) !== 'check') return
        } else {
          return
        }
        const base = receiverNode !== null && receiverNode.type === 'Identifier'
          ? localInitOf(receiverNode, getScope, receiverNode)
          : receiverNode
        const terminal = tracesToSchemaTerminal(base, getScope, 0)
        if (receiverHasOverride(base, terminal)) return
        for (const argument of node.arguments) {
          if (isNotSpread(argument)) inspectCheckArgument(context, argument, getScope, exportedNames, terminal)
        }
      },
    }
  },
})
