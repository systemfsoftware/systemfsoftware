// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const OptionsElement = S.Struct({
  allowUtilityTypes: S.optionalWith(
    S.Boolean.pipe(S.annotations({
      description: 'Allow utility types like Pick<T, K> and Omit<T, K>',
    })),
    { default: () => true },
  ),
})

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'noInlineDestructuredType'

const getFunctionName = (node: ESTree.Node): string => {
  if (node.type === 'FunctionDeclaration' && node.id) {
    return node.id.name
  }

  const parent = node.parent
  if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name
  }
  if (parent && 'key' in parent && parent.key && parent.key.type === 'Identifier') {
    return parent.key.name
  }

  return 'Anonymous function'
}

const isInlineType = (typeAnnotation: ESTree.Node, allowUtilityTypes: boolean): boolean =>
  typeAnnotation.type === 'TSTypeLiteral' ||
  (!allowUtilityTypes && typeAnnotation.type === 'TSTypeReference')

const getTypeAnnotation = (param: ESTree.Node): ESTree.Node | undefined => {
  const target = param.type === 'AssignmentPattern' ? param.left : param
  if ('typeAnnotation' in target && target.typeAnnotation) {
    return target.typeAnnotation
  }
  return undefined
}

export const noInlineDestructuredType = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ban inline object type annotations (TSTypeLiteral) on destructured function parameters in favor of named types or utility generics',
    },
    schema: [
      JSONSchema.make(OptionsElement),
    ],
    messages: {
      noInlineDestructuredType:
        '{{name}} uses inline object type. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context) {
    // Stryker restore all
    const allowUtilityTypes = S.decodeUnknownSync(OptionsElement)(context.options[0] ?? {}).allowUtilityTypes

    const checkParams = (node: ESTree.Node) => {
      if (!('params' in node) || !Array.isArray(node.params)) return

      for (const param of node.params) {
        const annotation = getTypeAnnotation(param)
        if (!annotation) continue

        if (
          'typeAnnotation' in annotation && annotation.typeAnnotation &&
          isInlineType(annotation.typeAnnotation, allowUtilityTypes)
        ) {
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
    }

    return {
      FunctionDeclaration: checkParams,
      FunctionExpression: checkParams,
      ArrowFunctionExpression: checkParams,
    }
  },
})
