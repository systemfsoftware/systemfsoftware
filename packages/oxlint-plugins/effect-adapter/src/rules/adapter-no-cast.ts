import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { CAST_EXPECTED, CAST_FIX, meta, Options } from './adapter-no-cast.config.js'

export type MessageIds = 'asAssertion' | 'angleBracketAssertion'

const isAdapterFile = (filename: string): boolean => filename.endsWith('.adapter.ts')

const isConstAssertion = (node: ESTree.TSAsExpression): boolean => {
  const annotation = node.typeAnnotation
  if (annotation.type !== 'TSTypeReference') return false
  const typeName = annotation.typeName
  return typeName.type === 'Identifier' && typeName.name === 'const'
}

export const adapterNoCast = defineRule({
  meta,
  create(context: Context) {
    if (!isAdapterFile(context.filename)) return {}

    return {
      TSAsExpression(node: ESTree.TSAsExpression) {
        if (isConstAssertion(node)) return
        context.report({
          node,
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected: CAST_EXPECTED,
            actual: 'an as type assertion on foreign driver data',
            fix: CAST_FIX,
          },
        })
      },

      TSTypeAssertion(node: ESTree.TSTypeAssertion) {
        context.report({
          node,
          messageId: 'angleBracketAssertion',
          data: {
            name: 'type assertion',
            expected: CAST_EXPECTED,
            actual: 'an angle-bracket <T> type assertion on foreign driver data',
            fix: CAST_FIX,
          },
        })
      },
    }
  },
})
