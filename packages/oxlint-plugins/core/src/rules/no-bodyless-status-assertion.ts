// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds = 'bodylessStatusAssertion' | 'preferCheckResponseWithBody'

const STATUS_MATCHERS: ReadonlySet<string> = new Set(['toBe', 'toEqual', 'toStrictEqual'])

const isStatusMember = (node: ESTree.Node | undefined): boolean =>
  node !== undefined &&
  node.type === 'MemberExpression' &&
  node.computed === false &&
  node.property.type === 'Identifier' &&
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
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbids asserting an HTTP response status without surfacing the response body on failure. Use checkResponseWithBody so a mismatch reports the problem+json detail, not a bare "expected 402 to be 200".',
    },
    schema: [],
    messages: {
      bodylessStatusAssertion:
        'Asserting `.status` against {{status}} with `expect` discards the response body; a failure shows only the status codes. Replace with `await checkResponseWithBody(<response>, {{status}})`.',
      preferCheckResponseWithBody:
        '`checkResponse` reports only the status codes on failure. Replace with `await checkResponseWithBody(...)` to surface the response body in the assertion message.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'checkResponse') {
          context.report({ node: node.callee, messageId: 'preferCheckResponseWithBody' })
          return
        }

        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed !== false ||
          node.callee.property.type !== 'Identifier' ||
          !STATUS_MATCHERS.has(node.callee.property.name) ||
          !isExpectStatusCall(node.callee.object)
        ) {
          return
        }

        const status = numericLiteralValue(node.arguments[0])
        if (status === undefined) {
          return
        }

        context.report({ node, messageId: 'bodylessStatusAssertion', data: { status: String(status) } })
      },
    }
  },
})
