import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  GENERATED_LAW_NAMES,
  LAW_DUPLICATE_ACTUAL,
  LAW_DUPLICATE_EXPECTED,
  LAW_DUPLICATE_FIX,
  meta,
  SCHEMA_PROPERTY_SUFFIX,
} from './no-schema-law-duplicate.config.js'

export type MessageIds = 'lawDuplicate'

const calleeName = (callee: ESTree.Node): string | undefined => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name
  return undefined
}

export const noSchemaLawDuplicate = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(SCHEMA_PROPERTY_SUFFIX)) return {}
    return {
      CallExpression(node: ESTree.CallExpression) {
        const name = calleeName(node.callee)
        if (name === undefined || !GENERATED_LAW_NAMES.has(name)) return
        context.report({
          node,
          messageId: 'lawDuplicate',
          data: {
            name: `${name}(...) in a schema property test`,
            expected: LAW_DUPLICATE_EXPECTED,
            actual: LAW_DUPLICATE_ACTUAL,
            fix: LAW_DUPLICATE_FIX,
          },
        })
      },
    }
  },
})
