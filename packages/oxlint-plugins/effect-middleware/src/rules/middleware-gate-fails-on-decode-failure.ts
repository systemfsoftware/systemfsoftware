import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './middleware-gate-fails-on-decode-failure.config.js'

export type MessageIds = 'gateFail'

const isMiddlewareFile = (filename: string): boolean => filename.endsWith('.middleware.ts')

const isNullLiteral = (node: ESTree.Node | null): boolean => node?.type === 'Literal' && node.value === null

const isUndefinedIdentifier = (node: ESTree.Node | null): boolean =>
  node?.type === 'Identifier' && node.name === 'undefined'

const isVoidExpression = (node: ESTree.Node | null): boolean =>
  node?.type === 'UnaryExpression' && node.operator === 'void'

const isMemberExpression = (
  node: ESTree.Node | null,
  object: string,
  property: string,
): boolean =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  node.object.name === object &&
  node.property.name === property

const isOptionCall = (node: ESTree.Node | null): boolean =>
  node?.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  !node.callee.computed &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'Option'

const isNullableSucceedArgument = (node: ESTree.Expression): boolean =>
  isNullLiteral(node) ||
  isUndefinedIdentifier(node) ||
  isVoidExpression(node) ||
  isOptionCall(node) ||
  isMemberExpression(node, 'Option', 'none')

const isTypeofUndefinedCheck = (left: ESTree.Expression, right: ESTree.Expression): boolean => {
  if (left.type !== 'UnaryExpression') return false
  if (left.operator !== 'typeof') return false
  if (left.argument.type !== 'Identifier') return false
  if (right.type !== 'Literal') return false
  return right.value === 'undefined'
}

const isEffectSucceedOfNullable = (node: ESTree.CallExpression): boolean => {
  if (!isMemberExpression(node.callee, 'Effect', 'succeed')) return false
  if (node.arguments.length !== 1) return false
  const argument = node.arguments[0]
  return argument !== undefined && argument.type !== 'SpreadElement' && isNullableSucceedArgument(argument)
}

const describeArgument = (argument: ESTree.Expression): string => {
  if (isNullLiteral(argument)) return 'null'
  if (isUndefinedIdentifier(argument)) return 'undefined'
  if (isVoidExpression(argument)) return 'void 0'
  if (isMemberExpression(argument, 'Option', 'none')) return 'Option.none'
  return `Option.${
    argument.type === 'CallExpression' && argument.callee.type === 'MemberExpression' && !argument.callee.computed
      ? argument.callee.property.name
      : argument.type
  }(...)`
}

const isAbsenceCheckTest = (test: ESTree.Expression): boolean => {
  if (test.type === 'UnaryExpression' && test.operator === '!') {
    return test.argument.type === 'Identifier'
  }
  if (test.type === 'CallExpression' && isMemberExpression(test.callee, 'Option', 'isNone')) {
    return (
      test.arguments.length === 1 &&
      test.arguments[0] !== undefined &&
      test.arguments[0].type === 'Identifier'
    )
  }
  if (test.type !== 'BinaryExpression') return false
  if (test.operator !== '===' && test.operator !== '==') return false

  const left = test.left
  const right = test.right

  if (isTypeofUndefinedCheck(left, right)) return true
  if (isTypeofUndefinedCheck(right, left)) return true
  if (isNullLiteral(right) && left.type === 'Identifier') return true
  if (isNullLiteral(left) && right.type === 'Identifier') return true
  if (isUndefinedIdentifier(right) && left.type === 'Identifier') return true
  if (isUndefinedIdentifier(left) && right.type === 'Identifier') return true

  return false
}

export const middlewareGateFailsOnDecodeFailure = defineRule({
  meta,
  create(context: Context) {
    if (!isMiddlewareFile(context.filename)) return {}

    const inDecodeFailureBranch = (node: ESTree.Node): boolean => {
      let child: ESTree.Node = node
      let current: ESTree.Node | null | undefined = node.parent
      while (current != null) {
        if (current.type === 'IfStatement' && child === current.consequent && isAbsenceCheckTest(current.test)) {
          return true
        }
        child = current
        current = current.parent
      }
      return false
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isEffectSucceedOfNullable(node)) return
        if (!inDecodeFailureBranch(node)) return
        const argument = node.arguments[0]
        if (argument === undefined || argument.type === 'SpreadElement') return
        context.report({
          node,
          messageId: 'gateFail',
          data: {
            name: `Effect.succeed(${describeArgument(argument)})`,
            expected: 'a decode-failure branch that produces Effect.fail — the gate short-circuits at the edge',
            actual: 'a decode-failure branch that succeeds with an Option or nullable',
            fix:
              'return Effect.fail with the typed 401/403/400 error so downstream handlers never see the invalid state',
          },
        })
      },
    }
  },
})
