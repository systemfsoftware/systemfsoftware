import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isExecutorFile } from './cell.js'
import { BORROW_FIX_TEMPLATE, EXPECTED_DEPENDENCY_TYPE, meta } from './executor-deps-borrowed-types.config.js'

export type MessageIds = 'handWrittenMethodSignature'

const CONTEXT_OBJECT_NAME = 'Context'
const TAG_PROPERTY_NAME = 'Tag'

const propertyKeyName = (
  key: ESTree.Node,
): { name: string; omit: false } | { omit: true } => {
  if (key.type === 'Identifier') return { name: key.name, omit: false }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return { name: key.value, omit: false }
  }
  return { omit: true }
}

const isContextTagCallee = (callee: ESTree.Node): boolean => {
  if (callee.type !== 'CallExpression') return false
  const inner = callee.callee
  if (inner.type !== 'MemberExpression') return false
  if (inner.computed) return false
  if (inner.object.type !== 'Identifier') return false
  if (inner.object.name !== CONTEXT_OBJECT_NAME) return false
  return inner.property.name === TAG_PROPERTY_NAME
}

const shapeLiteralFromParams = (
  params: readonly ESTree.Node[],
): ESTree.TSTypeLiteral | null => {
  for (const param of params) {
    if (param.type === 'TSTypeLiteral') return param
  }
  return null
}

const reportHandWritten = (
  context: Context,
  node: ESTree.Node,
  name: string,
): void => {
  context.report({
    node,
    messageId: 'handWrittenMethodSignature',
    data: {
      name,
      expected: EXPECTED_DEPENDENCY_TYPE,
      actual: `a hand-written signature for ${name}`,
      fix: BORROW_FIX_TEMPLATE,
    },
  })
}

export const executorDepsBorrowedTypes = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    return {
      ClassDeclaration(node: ESTree.Class) {
        const superClass = node.superClass
        if (!superClass) return
        if (superClass.type !== 'CallExpression') return
        if (!isContextTagCallee(superClass.callee)) return
        const typeArguments = superClass.typeArguments
        if (!typeArguments) return

        const shape = shapeLiteralFromParams(typeArguments.params)
        if (!shape) return

        for (const member of shape.members) {
          if (member.type === 'TSMethodSignature') {
            if (member.computed) continue
            const key = propertyKeyName(member.key)
            if (key.omit) continue
            reportHandWritten(context, member, key.name)
            continue
          }

          if (member.type !== 'TSPropertySignature') continue
          if (member.computed) continue
          const annotation = member.typeAnnotation
          if (!annotation) continue
          if (annotation.typeAnnotation.type !== 'TSFunctionType') continue

          const key = propertyKeyName(member.key)
          if (key.omit) continue
          reportHandWritten(context, member, key.name)
        }
      },
    }
  },
})
