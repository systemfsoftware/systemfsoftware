import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { getClassName, getTypeIdIdentifier, isTaggedClassOrError } from './tagged-class.js'
import { meta } from './workflow-typeid-required.config.js'

export type MessageIds = 'missingTypeId'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

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
        const name = getClassName(node)
        if (name === undefined) return

        if (getTypeIdIdentifier(node) === undefined) {
          context.report({
            node,
            messageId: 'missingTypeId',
            data: {
              name,
              expected: 'every S.TaggedClass/S.TaggedError in *.workflow.ts to carry its union TypeId',
              actual: `class ${name} is missing its TypeId`,
              fix:
                "add the UNION's shared TypeId to this variant: const <Union>TypeId: unique symbol = Symbol.for('@systemfsoftware/<pkg>/<Union>') declared once, then readonly [<Union>TypeId] = <Union>TypeId on every variant",
            },
          })
        }
      },
    }
  },
})
