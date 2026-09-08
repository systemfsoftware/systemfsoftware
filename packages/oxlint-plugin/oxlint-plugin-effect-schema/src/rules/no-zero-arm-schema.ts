import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import { meta, ZERO_ARM_ACTUAL, ZERO_ARM_EXPECTED, ZERO_ARM_FIX } from './no-zero-arm-schema.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'zeroArmSchema'

type GetScope = (node: ESTree.Node) => unknown

const vocabularyMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin) ?? null
}

export const noZeroArmSchema = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    const report = (node: ESTree.Node, name: string): void => {
      context.report({
        node,
        messageId: 'zeroArmSchema',
        data: {
          name,
          expected: ZERO_ARM_EXPECTED,
          actual: ZERO_ARM_ACTUAL,
          fix: ZERO_ARM_FIX,
        },
      })
    }
    return {
      CallExpression(node: ESTree.CallExpression) {
        const member = vocabularyMemberOf(node.callee, getScope)
        if (member === 'Union') {
          if (node.arguments.length === 0) {
            report(node, 'a union with no arms')
            return
          }
          const first = node.arguments[0]
          if (first === undefined) return
          if (first.type === 'ArrayExpression' && first.elements.length === 0) {
            report(node, 'a union with no arms')
          }
          return
        }
        if (member === 'Literals') {
          if (node.arguments.length === 0) report(node, 'a literals with no arms')
        }
      },
    }
  },
})
