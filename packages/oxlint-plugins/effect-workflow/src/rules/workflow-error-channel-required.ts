import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  EITHER_TYPE_NAME,
  LEFT_CONSTRUCTOR,
  meta,
  Options,
  TAGGED_ERROR_NAME,
  UNINHABITED_LEFT_KINDS,
  WORKFLOW_SUFFIX,
} from './workflow-error-channel-required.config.js'

export type MessageIds = 'missingErrorChannel' | 'uninhabitedErrorChannel' | 'plainErrorChannel'

const eitherReference = (annotation: ESTree.Node | undefined | null): ESTree.TSTypeReference | null => {
  if (annotation === undefined || annotation === null) return null
  if (annotation.type !== 'TSTypeAnnotation') return null
  const declared = annotation.typeAnnotation
  if (declared.type !== 'TSTypeReference') return null
  const typeName = declared.typeName
  if (typeName.type === 'Identifier') return typeName.name === EITHER_TYPE_NAME ? declared : null
  if (typeName.type !== 'TSQualifiedName') return null
  return typeName.right.name === EITHER_TYPE_NAME ? declared : null
}

const extendsTaggedError = (node: ESTree.Class): boolean => {
  const heritage = node.superClass
  const outer = heritage?.type === 'CallExpression' ? heritage.callee : null
  const inner = outer?.type === 'CallExpression' ? outer.callee : null
  if (inner?.type === 'Identifier') return inner.name === TAGGED_ERROR_NAME
  if (inner?.type !== 'MemberExpression') return false
  return inner.property.type === 'Identifier' && inner.property.name === TAGGED_ERROR_NAME
}

export const workflowErrorChannelRequired = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(WORKFLOW_SUFFIX)) return {}

    const untaggedClasses = new Set<string>()

    const check = (target: ESTree.Node, annotation: ESTree.Node | undefined | null, name: string): void => {
      const either = eitherReference(annotation)
      if (either === null) {
        context.report({
          node: target,
          messageId: 'missingErrorChannel',
          data: {
            name: `The exported workflow ${name}`,
            expected: 'a return type of Either<Decision, Error>',
            actual: 'a return type with no error channel',
            fix:
              'add the domain error the consumer branches on and return Either<Decision, Error>; a total computation with no domain error is not a workflow — rename the file to a .kernel.ts or .observer.ts cell',
          },
        })
        return
      }
      const left = either.typeArguments?.params[1]
      const actual = left === undefined
        ? 'an unparameterized Either'
        : `${left.type.replace('TS', '').replace('Keyword', '').toLowerCase()}, which declares no domain error`
      if (left !== undefined && !UNINHABITED_LEFT_KINDS.includes(left.type)) return
      context.report({
        node: target,
        messageId: 'uninhabitedErrorChannel',
        data: {
          name: `The error channel of ${name}`,
          expected: 'an inhabited S.TaggedError variant',
          actual,
          fix:
            'name the domain error the consumer aborts on and declare it as an S.TaggedError; if no such error exists this is not a workflow — rename the file to a .kernel.ts or .observer.ts cell',
        },
      })
    }

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (extendsTaggedError(node)) return
        untaggedClasses.add(context.sourceCode.getText(node.id))
      },

      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        if (callee.property.type !== 'Identifier') return
        if (callee.property.name !== LEFT_CONSTRUCTOR) return
        const argument = node.arguments[0]
        if (argument?.type !== 'NewExpression') return
        if (argument.callee.type !== 'Identifier') return
        const constructed = argument.callee.name
        const plain = constructed === 'Error'
        if (!plain && !untaggedClasses.has(constructed)) return
        context.report({
          node,
          messageId: 'plainErrorChannel',
          data: {
            name: `The value passed to Either.left (${constructed})`,
            expected: 'an S.TaggedError declared in this workflow',
            actual: plain ? 'a plain JavaScript Error' : `${constructed}, which does not extend S.TaggedError`,
            fix:
              `declare ${constructed} as class ${constructed} extends S.TaggedError<${constructed}>()('${constructed}', { ... }) so the error carries a tag the consumer can dispatch on`,
          },
        })
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration

        if (declaration?.type === 'FunctionDeclaration') {
          check(declaration, declaration.returnType, context.sourceCode.getText(declaration.id))
          return
        }

        if (declaration?.type !== 'VariableDeclaration') return
        for (const declarator of declaration.declarations) {
          const init = declarator.init
          if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') continue
          check(declarator, init.returnType, context.sourceCode.getText(declarator.id))
        }
      },
    }
  },
})
