import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isSchemaVocabularyOrigin, resolveImportOrigin } from './ImportOrigin.js'
import {
  LEGACY_ACTUAL,
  LEGACY_EXPECTED,
  LEGACY_FIX,
  meta,
  MISSING_ACTUAL,
  MISSING_EXPECTED,
  MISSING_FIX,
} from './schema-filter-constructive-generation.config.js'

export type MessageIds = 'filterDiscards' | 'legacyArbitraryFunction'

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
  const sequence = origin.importedName === null ? origin.path : [origin.importedName, ...origin.path]
  return sequence[sequence.length - 1] ?? null
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

const hasConstructiveMetadata = (annotations: ESTree.Node | null): 'yes' | 'legacy' | 'no' | 'opaque' => {
  if (annotations === null) return 'no'
  if (annotations.type !== 'ObjectExpression') return 'opaque'
  const arbitrary = objectPropertyOf(annotations, 'arbitrary')
  if (arbitrary === null) return hasSpread(annotations) ? 'opaque' : 'no'
  const value = arbitrary.value
  if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') return 'legacy'
  if (value.type !== 'ObjectExpression') return 'opaque'
  if (objectPropertyOf(value, 'constraint') !== null || objectPropertyOf(value, 'candidate') !== null) return 'yes'
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
      if (annotations !== undefined && objectPropertyOf(annotations, 'toArbitrary') !== null) return true
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

const receiverHasOverride = (receiver: ESTree.Node, getScope: GetScope): boolean => {
  if (receiver.type === 'Identifier') {
    const init = localInitOf(receiver, getScope, receiver)
    return init !== null && carriesNodeOverride(init, 0)
  }
  return carriesNodeOverride(receiver, 0)
}

const inspectCheckArgument = (context: Context, argument: ESTree.Node, getScope: GetScope): void => {
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
      if (member === 'makeFilter' || member === 'makeFilterGroup') filterCall = init
    }
  }
  if (filterCall === null) return
  const second = filterCall.arguments[1]
  const annotations = second !== undefined && isNotSpread(second) ? second : null
  const verdict = hasConstructiveMetadata(annotations)
  if (verdict === 'no') {
    context.report({
      node: filterCall,
      messageId: 'filterDiscards',
      data: {
        name: 'a filter declared in this file',
        expected: MISSING_EXPECTED,
        actual: MISSING_ACTUAL,
        fix: MISSING_FIX,
      },
    })
  }
  if (verdict === 'legacy') {
    context.report({
      node: filterCall,
      messageId: 'legacyArbitraryFunction',
      data: {
        name: 'a filter declared in this file',
        expected: LEGACY_EXPECTED,
        actual: LEGACY_ACTUAL,
        fix: LEGACY_FIX,
      },
    })
  }
}

export const schemaFilterConstructiveGeneration = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return
        const property = node.callee.property
        if (property.type !== 'Identifier' || property.name !== 'check') return
        if (receiverHasOverride(node.callee.object, getScope)) return
        for (const argument of node.arguments) {
          if (isNotSpread(argument)) inspectCheckArgument(context, argument, getScope)
        }
      },
    }
  },
})
