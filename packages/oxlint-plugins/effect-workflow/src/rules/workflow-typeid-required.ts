import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './workflow-typeid-required.config.js'

export type MessageIds = 'missingTypeId'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isTaggedClassOrError = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === 'CallExpression') {
    const inner = node.callee
    if (inner.callee.type !== 'MemberExpression') return false
    const callee = inner.callee
    if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
    if (callee.property.type !== 'Identifier') return false
    return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
  }
  if (node.callee.type === 'MemberExpression') {
    const callee = node.callee
    if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
    if (callee.property.type !== 'Identifier') return false
    return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
  }
  return false
}

const classHasTypeId = (cls: ESTree.Class): boolean => {
  for (const el of cls.body.body) {
    if (el.type !== 'PropertyDefinition') continue
    if (el.computed && el.key.type === 'Identifier') {
      return true
    }
  }
  return false
}

const getClassName = (node: ESTree.Class): string => node.id!.name

export const workflowTypeidRequired = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedClassOrError(node.superClass)) return

        if (!classHasTypeId(node)) {
          context.report({
            node,
            messageId: 'missingTypeId',
            data: { name: getClassName(node) },
          })
        }
      },
    }
  },
})
