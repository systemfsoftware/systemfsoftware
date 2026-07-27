import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { COMMAND_SUFFIX, meta, Options } from './workflow-no-unconstructed-variant.config.js'

export type MessageIds = 'unconstructedVariant'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isTaggedClassOrErrorCall = (node: ESTree.CallExpression): boolean => {
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

const constructedName = (node: ESTree.NewExpression): string | undefined => {
  if (node.callee.type !== 'Identifier') return undefined
  return node.callee.name
}

const makeCallName = (node: ESTree.CallExpression): string | undefined => {
  if (node.callee.type !== 'MemberExpression') return undefined
  const callee = node.callee
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'make') return undefined
  if (callee.object.type !== 'Identifier') return undefined
  return callee.object.name
}

export const workflowNoUnconstructedVariant = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const declared: ESTree.Class[] = []
    const constructed = new Set<string>()

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedClassOrErrorCall(node.superClass)) return
        declared.push(node)
      },
      NewExpression(node: ESTree.NewExpression) {
        const name = constructedName(node)
        if (name !== undefined) constructed.add(name)
      },
      CallExpression(node: ESTree.CallExpression) {
        const name = makeCallName(node)
        if (name !== undefined) constructed.add(name)
      },
      'Program:exit'() {
        for (const cls of declared) {
          if (cls.id && !cls.id.name.endsWith(COMMAND_SUFFIX) && !constructed.has(cls.id.name)) {
            context.report({
              node: cls,
              messageId: 'unconstructedVariant',
              data: {
                name: cls.id.name,
                expected: 'every declared variant is constructed somewhere in the file',
                actual: `${cls.id.name} is declared but never constructed`,
                fix:
                  'construct it in a step or decision arm, or delete the variant — a union member nothing produces makes the union lie',
              },
            })
          }
        }
      },
    }
  },
})
