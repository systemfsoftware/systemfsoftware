import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  BEHAVIOUR_EXPECTED,
  BEHAVIOUR_FIX,
  DEFAULT_FUNCTION_EXPORT_ACTUAL,
  FUNCTION_CONST_ACTUAL,
  FUNCTION_DECLARATION_ACTUAL,
  meta,
  METHOD_DEFINITION_ACTUAL,
} from './shape-no-behaviour.config.js'

export type MessageIds =
  | 'functionDeclaration'
  | 'functionConst'
  | 'methodDefinition'
  | 'defaultFunctionExport'

const SHAPE_SUFFIX = '.shape.ts'

const isShapeFile = (filename: string): boolean => filename.endsWith(SHAPE_SUFFIX)

const isFunctionExpression = (node: ESTree.Node): boolean =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'

const declaratorName = (id: ESTree.Node): string => id.type === 'Identifier' ? id.name : '<pattern>'

const keyName = (key: ESTree.Node): string => {
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal') return String(key.value)
  return '<computed>'
}

export const shapeNoBehaviour = defineRule({
  meta,
  create(context: Context) {
    if (!isShapeFile(context.filename)) return {}

    return {
      FunctionDeclaration(node: ESTree.Function) {
        context.report({
          node,
          messageId: 'functionDeclaration',
          data: {
            name: node.id === null ? '<anonymous>' : node.id.name,
            expected: BEHAVIOUR_EXPECTED,
            actual: FUNCTION_DECLARATION_ACTUAL,
            fix: BEHAVIOUR_FIX,
          },
        })
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        const init = node.init
        if (!init) return
        if (!isFunctionExpression(init)) return
        context.report({
          node,
          messageId: 'functionConst',
          data: {
            name: declaratorName(node.id),
            expected: BEHAVIOUR_EXPECTED,
            actual: FUNCTION_CONST_ACTUAL,
            fix: BEHAVIOUR_FIX,
          },
        })
      },
      MethodDefinition(node: ESTree.MethodDefinition) {
        context.report({
          node,
          messageId: 'methodDefinition',
          data: {
            name: keyName(node.key),
            expected: BEHAVIOUR_EXPECTED,
            actual: METHOD_DEFINITION_ACTUAL,
            fix: BEHAVIOUR_FIX,
          },
        })
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        if (!isFunctionExpression(node.declaration)) return
        context.report({
          node,
          messageId: 'defaultFunctionExport',
          data: {
            name: '<default export>',
            expected: BEHAVIOUR_EXPECTED,
            actual: DEFAULT_FUNCTION_EXPORT_ACTUAL,
            fix: BEHAVIOUR_FIX,
          },
        })
      },
    }
  },
})
