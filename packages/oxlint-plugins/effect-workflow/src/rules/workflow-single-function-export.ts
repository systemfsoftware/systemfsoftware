import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option } from 'effect'
import { meta } from './workflow-single-function-export.config.js'

export type MessageIds = 'tooManyFunctionExports'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isFunctionExport = (node: ESTree.ExportNamedDeclaration): boolean => {
  if (!node.declaration) return false
  if (node.declaration.type === 'FunctionDeclaration') return true
  if (node.declaration.type === 'VariableDeclaration') {
    for (const decl of node.declaration.declarations) {
      if (decl.init && (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')) {
        return true
      }
    }
  }
  return false
}

export const workflowSingleFunctionExport = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const functionExports: ESTree.Node[] = []

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (isFunctionExport(node)) {
          functionExports.push(node)
        }
      },
      'Program:exit'() {
        if (functionExports.length !== 1) {
          const reportNode = A.last(functionExports).pipe(Option.getOrNull)
          if (reportNode) {
            context.report({
              node: reportNode,
              messageId: 'tooManyFunctionExports',
              data: { count: String(functionExports.length) },
            })
          } else {
            const program = context.sourceCode.ast
            const firstNode = program.body[0]
            if (firstNode) {
              context.report({
                node: firstNode,
                messageId: 'tooManyFunctionExports',
                data: { count: '0' },
              })
            }
          }
        }
      },
    }
  },
})
