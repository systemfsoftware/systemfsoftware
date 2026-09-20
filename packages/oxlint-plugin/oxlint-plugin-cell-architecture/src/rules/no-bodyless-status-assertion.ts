import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { meta, STATUS_MATCHERS } from './no-bodyless-status-assertion.config.js'

export type Options = []
export type MessageIds = 'bodylessStatusAssertion' | 'preferCheckResponseWithBody'

const isStatusMember = (node: ESTree.Node | undefined): boolean =>
  node !== undefined &&
  node.type === 'MemberExpression' &&
  node.computed === false &&
  node.property.name === 'status'

const isExpectStatusCall = (node: ESTree.Node | undefined): boolean =>
  node !== undefined &&
  node.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  node.callee.name === 'expect' &&
  isStatusMember(node.arguments[0])

const numericLiteralValue = (node: ESTree.Node | undefined): number | undefined =>
  node !== undefined && node.type === 'Literal' && typeof node.value === 'number' ? node.value : undefined

export const noBodylessStatusAssertion = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'checkResponse') {
          context.report({ node: node.callee, messageId: 'preferCheckResponseWithBody' })
          return
        }

        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.computed === false &&
          STATUS_MATCHERS.has(node.callee.property.name) &&
          isExpectStatusCall(node.callee.object)
        ) {
          const status = numericLiteralValue(node.arguments[0])
          if (status !== undefined) {
            context.report({ node, messageId: 'bodylessStatusAssertion', data: { status: String(status) } })
          }
        }
      },
    }
  },
})
