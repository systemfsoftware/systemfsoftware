// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds = 'forbidden' | 'useCause' | 'standaloneStringWrap' | 'toStringWrap' | 'templateLiteralWrap'

const STRING_FUNCTION = 'String'
const FALLBACK_MESSAGE = 'Error occurred'
const ERROR_LIKE_NAMES = new Set(['error', 'err', 'e', 'cause', 'exception', 'ex'])

export const banErrorString = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ban string coercion of error-like values. Use { cause } option to preserve original error context',
    },
    schema: [],
    hasSuggestions: true,
    messages: {
      forbidden: '{{pattern}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      useCause: 'Replace {{pattern}} with {{replacement}} to preserve original error context.',
      standaloneStringWrap:
        "String({{name}}) stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
      toStringWrap:
        "{{name}}.toString() stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
      templateLiteralWrap:
        "`${'{{name}}'}` stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
    },
  },
  create(context: Context) {
    // Stryker restore all
    const getConstructorName = (callee: ESTree.Expression): string | null => {
      if (callee.type === 'Identifier') {
        return callee.name
      }

      if (callee.type === 'MemberExpression' && !callee.computed && 'name' in callee.property) {
        return callee.property.name
      }

      return null
    }

    const isErrorLikeConstructor = (name: string): boolean => name.endsWith('Error')

    const isStringCall = (node: ESTree.Node): node is ESTree.CallExpression => {
      if (node.type !== 'CallExpression' || node.arguments.length !== 1) {
        return false
      }

      if (node.callee.type === 'Identifier') {
        return node.callee.name === STRING_FUNCTION
      }

      return (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === STRING_FUNCTION
      )
    }

    const isToStringCall = (node: ESTree.CallExpression): ESTree.Expression | null => {
      if (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.name === 'toString' &&
        node.arguments.length === 0
      ) {
        return node.callee.object
      }

      return null
    }

    const isErrorLikeName = (node: ESTree.Node | undefined): string | null => {
      if (node && node.type === 'Identifier' && ERROR_LIKE_NAMES.has(node.name)) {
        return node.name
      }

      return null
    }

    const isInsideErrorConstructor = (node: ESTree.CallExpression): boolean => {
      const parent = node.parent
      if (!parent || parent.type !== 'NewExpression') {
        return false
      }

      const constructorName = getConstructorName(parent.callee)

      return constructorName !== null && isErrorLikeConstructor(constructorName)
    }

    const reportIfErrorLike = (
      reportNode: ESTree.Node,
      checkNode: ESTree.Node | undefined,
      messageId: MessageIds,
    ): void => {
      const name = isErrorLikeName(checkNode)
      if (name !== null) {
        context.report({ node: reportNode, messageId, data: { name } })
      }
    }

    return {
      NewExpression(node: ESTree.NewExpression) {
        const [firstArgument] = node.arguments
        if (!firstArgument || !isStringCall(firstArgument)) {
          return
        }

        const constructorName = getConstructorName(node.callee)
        if (constructorName === null || !isErrorLikeConstructor(constructorName)) {
          return
        }

        const [causeArgument] = firstArgument.arguments
        const sourceCode = context.sourceCode
        const causeText = sourceCode.getText(causeArgument)
        const actualText = sourceCode.getText(node)
        const replacement = `'${FALLBACK_MESSAGE}', { cause: ${causeText} }`

        context.report({
          node: firstArgument,
          messageId: 'forbidden',
          data: {
            pattern: `new ${constructorName}(String(error))`,
            expected: `new ${constructorName}('message', { cause: error })`,
            actual: actualText,
            fix: 'replace String(error) with an explicit message and { cause: error }',
          },
          suggest: [
            {
              messageId: 'useCause',
              data: { pattern: sourceCode.getText(firstArgument), replacement },
              fix: (fixer) => fixer.replaceText(firstArgument, replacement),
            },
          ],
        })
      },

      CallExpression(node: ESTree.CallExpression) {
        if (isStringCall(node) && !isInsideErrorConstructor(node)) {
          reportIfErrorLike(node, node.arguments[0], 'standaloneStringWrap')

          return
        }

        const toStringObject = isToStringCall(node)
        if (toStringObject !== null) {
          reportIfErrorLike(node, toStringObject, 'toStringWrap')
        }
      },

      TemplateLiteral(node: ESTree.TemplateLiteral) {
        if (node.quasis.length !== 2) {
          return
        }

        const first = node.quasis[0]
        const last = node.quasis[1]
        if (!first || !last || first.value.raw !== '' || last.value.raw !== '') {
          return
        }

        reportIfErrorLike(node, node.expressions[0], 'templateLiteralWrap')
      },
    }
  },
})
