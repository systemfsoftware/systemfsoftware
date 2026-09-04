import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isSchemaVocabularyOrigin, originMemberSequence, resolveImportOrigin } from './ImportOrigin.js'
import {
  CHECKED_ELEMENT_ACTUAL,
  CHECKED_ELEMENT_EXPECTED,
  CHECKED_ELEMENT_FIX,
  meta,
} from './schema-checked-element-named.config.js'

export type MessageIds = 'anonymousCheckedElement'

type GetScope = (node: ESTree.Node) => unknown

const vocabularyMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  const sequence = originMemberSequence(origin)
  return sequence[sequence.length - 1] ?? null
}

const COLLECTION_MEMBERS: Readonly<Record<string, true>> = {
  Array: true,
  Record: true,
  Tuple: true,
  Union: true,
  ReadonlySet: true,
  HashSet: true,
  ReadonlyMap: true,
  HashMap: true,
}

const MAX_WALK_DEPTH = 32

const TS_EXPRESSION_WRAPPERS: Readonly<Record<string, true>> = {
  TSAsExpression: true,
  TSSatisfiesExpression: true,
  TSNonNullExpression: true,
  TSTypeAssertion: true,
  TSInstantiationExpression: true,
}

type ExpressionWrapperNode = ESTree.Node & { readonly expression: ESTree.Node }

const isExpressionWrapper = (node: ESTree.Node): node is ExpressionWrapperNode =>
  TS_EXPRESSION_WRAPPERS[node.type] === true

const unwrapWrappers = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = unwrapWrappers(node)
  while (current.type === 'SequenceExpression') {
    const expressions = current.expressions
    const last = expressions[expressions.length - 1]
    if (last === undefined) return current
    current = unwrapWrappers(last)
  }
  return current
}

const findFirstCheck = (
  node: ESTree.Node,
  getScope: GetScope,
  depth: number,
): ESTree.CallExpression | null => {
  if (depth > MAX_WALK_DEPTH) return null
  const current = unwrapExpression(node)
  if (current.type === 'ArrayExpression') {
    for (const element of current.elements) {
      if (element === null) continue
      const found = findFirstCheck(element.type === 'SpreadElement' ? element.argument : element, getScope, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  if (current.type === 'LogicalExpression') {
    for (const branch of [current.left, current.right]) {
      const found = findFirstCheck(branch, getScope, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  if (current.type === 'ConditionalExpression') {
    for (const branch of [current.consequent, current.alternate]) {
      const found = findFirstCheck(branch, getScope, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  if (current.type !== 'CallExpression') return null
  const calleeMember = vocabularyMemberOf(current.callee, getScope)
  if (calleeMember === 'check') return current
  for (const argument of current.arguments) {
    if (argument.type === 'SpreadElement') {
      const found = findFirstCheck(argument.argument, getScope, depth + 1)
      if (found !== null) return found
      continue
    }
    const found = findFirstCheck(argument, getScope, depth + 1)
    if (found !== null) return found
  }
  if (current.callee.type === 'MemberExpression') {
    return findFirstCheck(current.callee.object, getScope, depth + 1)
  }
  return null
}

export const schemaCheckedElementNamed = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    const reported = new Set<ESTree.Node>()
    const inspectElement = (element: ESTree.Node, combinator: string): void => {
      const found = findFirstCheck(element, getScope, 0)
      if (found === null || reported.has(found)) return
      reported.add(found)
      context.report({
        node: found,
        messageId: 'anonymousCheckedElement',
        data: {
          name: `an anonymous checked element in ${combinator}`,
          expected: CHECKED_ELEMENT_EXPECTED,
          actual: CHECKED_ELEMENT_ACTUAL,
          fix: CHECKED_ELEMENT_FIX,
        },
      })
    }
    return {
      CallExpression(node: ESTree.CallExpression) {
        const member = vocabularyMemberOf(node.callee, getScope)
        if (member === null || COLLECTION_MEMBERS[member] !== true) return
        for (const argument of node.arguments) {
          if (argument.type === 'SpreadElement') {
            inspectElement(argument.argument, member)
            continue
          }
          const unwrapped = unwrapExpression(argument)
          if (unwrapped.type === 'ArrayExpression') {
            for (const element of unwrapped.elements) {
              if (element === null) continue
              inspectElement(element.type === 'SpreadElement' ? element.argument : element, member)
            }
            continue
          }
          if (unwrapped.type === 'ObjectExpression' && (member === 'Record' || member === 'Map')) {
            for (const property of unwrapped.properties) {
              inspectElement(property.type === 'SpreadElement' ? property.argument : property.value, member)
            }
            continue
          }
          inspectElement(argument, member)
        }
      },
    }
  },
})
