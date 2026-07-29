import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './workflow-property-test-shape.config.js'

export type MessageIds = 'plainIt' | 'rawFcAssert'

const PropertySuffix = '.property.test.ts'

const isCallTo = (node: ESTree.CallExpression, name: string): boolean => {
  if (node.callee.type === 'Identifier') return node.callee.name === name
  if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
    return node.callee.property.name === name
  }
  return false
}

export const workflowPropertyTestShape = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(PropertySuffix)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (isCallTo(node, 'it') && node.callee.type === 'Identifier') {
          context.report({
            node,
            messageId: 'plainIt',
            data: {
              name: 'it()',
              expected: 'it.prop() from @effect/vitest for workflow property tests',
              actual: 'plain it() is used',
              fix: 'replace it() with it.prop() from @effect/vitest',
            },
          })
        }
        if (isCallTo(node, 'assert') && node.callee.type === 'MemberExpression') {
          const callee = node.callee
          if (callee.object.type === 'Identifier' && callee.object.name === 'fc') {
            context.report({
              node,
              messageId: 'rawFcAssert',
              data: {
                name: 'fc.assert()',
                expected: 'it.prop() from @effect/vitest',
                actual: 'raw fc.assert() is used',
                fix: 'replace raw fc.assert() with it.prop() from @effect/vitest',
              },
            })
          }
        }
      },
    }
  },
})
