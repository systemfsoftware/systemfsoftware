import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { BARE_ACTUAL, BARE_EXPECTED, BARE_FIX, meta } from './schema-bare-primitive-field.config.js'
import { analyzeChain, STRUCT_MEMBERS, unwrapExpression, vocabularyMemberOf } from './SchemaChain.js'

export type MessageIds = 'barePrimitiveField'

type GetScope = (node: ESTree.Node) => unknown

const fieldKeyOf = (property: ESTree.Node): string | null => {
  if (property.type !== 'Property' || property.computed) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

export const schemaBarePrimitiveField = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type !== 'MemberExpression' && node.callee.type !== 'Identifier') return
        const member = vocabularyMemberOf(node.callee, getScope)
        if (member === null || STRUCT_MEMBERS[member] !== true) return
        const first = node.arguments[0]
        if (first === undefined || first.type === 'SpreadElement') return
        const fields = unwrapExpression(first)
        if (fields.type !== 'ObjectExpression') return
        for (const property of fields.properties) {
          if (property.type !== 'Property') continue
          const key = fieldKeyOf(property)
          if (key === null) continue
          const result = analyzeChain(property.value, getScope, 0)
          if (result.base !== 'bare' || result.refined || result.opaque) continue
          context.report({
            node: property.value,
            messageId: 'barePrimitiveField',
            data: {
              name: `a bare-primitive domain field '${key}' (${result.member})`,
              expected: BARE_EXPECTED,
              actual: BARE_ACTUAL,
              fix: BARE_FIX,
            },
          })
        }
      },
    }
  },
})
