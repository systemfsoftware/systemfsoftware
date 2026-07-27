import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './workflow-no-async.config.js'

export type MessageIds = 'asyncFunction' | 'awaitExpression' | 'promiseType'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

type AsyncFunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

export const workflowNoAsync = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const checkFunction = (node: AsyncFunctionNode) => {
      if (node.async) {
        context.report({
          node,
          messageId: 'asyncFunction',
          data: {
            name: 'async',
            expected: 'a synchronous pure decision returning Either',
            actual: 'an async function',
            fix: 'move the async work to the shell and pass its result as command data',
          },
        })
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      AwaitExpression(node: ESTree.AwaitExpression) {
        context.report({
          node,
          messageId: 'awaitExpression',
          data: {
            name: 'await',
            expected: 'a synchronous pure decision returning Either',
            actual: 'an await expression',
            fix: 'move the async work to the shell and pass its result as command data',
          },
        })
      },
      TSTypeReference(node: ESTree.TSTypeReference) {
        if (node.typeName.type === 'Identifier' && node.typeName.name === 'Promise') {
          context.report({
            node,
            messageId: 'promiseType',
            data: {
              name: 'Promise',
              expected: 'a synchronous pure decision returning Either',
              actual: 'a Promise type reference',
              fix: 'move the async work to the shell and pass its result as command data',
            },
          })
        }
      },
    }
  },
})
