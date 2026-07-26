import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { BANNED, meta, Options } from './workflow-no-ambient-impurity.config.js'

export type MessageIds = 'forbidden'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isCallTo = (node: ESTree.CallExpression, objectName: string, methodName: string): boolean => {
  if (node.callee.type !== 'MemberExpression') return false
  const callee = node.callee
  if (callee.object.type !== 'Identifier' || callee.object.name !== objectName) return false
  if (callee.property.type !== 'Identifier' || callee.property.name !== methodName) return false
  return true
}

export const workflowNoAmbientImpurity = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        for (const [expr, reason] of Object.entries(BANNED)) {
          const parts = expr.split('.')
          const obj = parts[0]
          const method = parts[1]
          if (obj && method && isCallTo(node, obj, method)) {
            context.report({
              node,
              messageId: 'forbidden',
              data: { name: expr, reason },
            })
          }
        }
      },
    }
  },
})
