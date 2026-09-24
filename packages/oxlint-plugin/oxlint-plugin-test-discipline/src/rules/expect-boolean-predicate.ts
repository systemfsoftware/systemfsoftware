import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  BOOLEAN_MATCHERS,
  COMPARISON_OPERATORS,
  EXPECT,
  meta,
  NOT,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from './expect-boolean-predicate.config.js'

export type MessageIds = 'booleanPredicate'

const isExpectCallee = (callee: ESTree.CallExpression['callee']): boolean =>
  callee.type === 'Identifier' && callee.name === EXPECT

/**
 * Unwrap `expect(arg)` or `expect(arg).not` into the `expect` CallExpression.
 * Any other chain shape is left for the visitor to ignore.
 */
const expectCallOf = (node: ESTree.CallExpression): ESTree.CallExpression | undefined => {
  if (node.callee.type !== 'MemberExpression') return undefined
  let target: ESTree.Node = node.callee.object
  while (target.type === 'MemberExpression') {
    if (target.property.type !== 'Identifier' || target.property.name !== NOT) return undefined
    target = target.object
  }
  if (target.type !== 'CallExpression' || !isExpectCallee(target.callee)) return undefined
  return target
}

const isBooleanLiteral = (node: ESTree.Node | undefined): boolean =>
  node !== undefined && node.type === 'Literal' && typeof node.value === 'boolean'

/** The ARG positions `expect` exposes that no subject can fill by accident. */
const isEvaluatedInTest = (arg: ESTree.Expression | ESTree.SpreadElement): boolean => {
  switch (arg.type) {
    case 'CallExpression':
      return true
    case 'UnaryExpression':
      return arg.operator === '!'
    case 'LogicalExpression':
      return arg.operator === '&&' || arg.operator === '||'
    case 'BinaryExpression':
      return COMPARISON_OPERATORS[arg.operator] === true
    default:
      return false
  }
}

export const expectBooleanPredicate = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier') return
        if (BOOLEAN_MATCHERS[node.callee.property.name] !== true) return
        if (!isBooleanLiteral(node.arguments[0])) return
        const receiver = expectCallOf(node)
        if (receiver === undefined) return
        const arg = receiver.arguments[0]
        if (arg === undefined || !isEvaluatedInTest(arg)) return
        context.report({
          node,
          messageId: 'booleanPredicate',
          data: {
            name: VIOLATION_NAME,
            expected: VIOLATION_EXPECTED,
            actual: VIOLATION_ACTUAL,
            fix: VIOLATION_FIX,
          },
        })
      },
    }
  },
})
