import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import { meta, OptionsElement } from './no-inline-destructured-type.config.js'

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'noInlineDestructuredType'

const getFunctionName = (node: ESTree.Node): string => {
  if (node.type === 'FunctionDeclaration' && node.id !== null) {
    return node.id.name
  }
  const parent: ESTree.Node | null = node.parent
  if (parent !== null && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name
  }
  if (
    parent !== null &&
    'key' in parent &&
    parent.key.type === 'Identifier'
  ) {
    return parent.key.name
  }
  return 'Anonymous function'
}

const getTypeAnnotation = (param: ESTree.ParamPattern): ESTree.TSTypeAnnotation | undefined => {
  if (param.type === 'TSParameterProperty') return undefined
  const target = param.type === 'AssignmentPattern' ? param.left : param
  return target.typeAnnotation ?? undefined
}

const hasInlineTypeAnnotation = (annotation: ESTree.TSTypeAnnotation, allowUtilityTypes: boolean): boolean => {
  const inner = annotation.typeAnnotation
  if (inner.type === 'TSTypeLiteral') return true
  if (!allowUtilityTypes && inner.type === 'TSTypeReference') return true
  return false
}

export const noInlineDestructuredType = defineRule({
  meta,
  create(context) {
    const { allowUtilityTypes } = S.decodeUnknownSync(OptionsElement)(context.options[0] ?? {})

    const checkParams = (node: ESTree.ArrowFunctionExpression | ESTree.Function): void => {
      for (const param of node.params) {
        const annotation = getTypeAnnotation(param)
        if (annotation == null) continue
        if (!hasInlineTypeAnnotation(annotation, allowUtilityTypes)) continue

        context.report({
          node: annotation,
          messageId: 'noInlineDestructuredType',
          data: {
            name: getFunctionName(node),
            expected: 'Named type, utility type (Pick/Omit), or destructuring in function body',
            actual: 'Inline { prop: type } annotation',
            fix: 'Extract to a named type, use Pick/Omit, or destructure in function body',
          },
        })
      }
    }

    return {
      FunctionDeclaration: checkParams,
      FunctionExpression: checkParams,
      ArrowFunctionExpression: checkParams,
    }
  },
})
