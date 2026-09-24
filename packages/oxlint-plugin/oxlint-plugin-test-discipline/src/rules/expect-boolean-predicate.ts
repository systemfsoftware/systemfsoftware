import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  BOOLEAN_MATCHERS,
  COMPARISON_OPERATORS,
  meta,
  NOT,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from './expect-boolean-predicate.config.js'
import { expectCallOf } from './expect-call.js'

export type MessageIds = 'booleanPredicate'

const isNotMember = (member: ESTree.MemberExpression): boolean =>
  member.property.type === 'Identifier' && member.property.name === NOT

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
        const receiver = expectCallOf(node, isNotMember)
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
