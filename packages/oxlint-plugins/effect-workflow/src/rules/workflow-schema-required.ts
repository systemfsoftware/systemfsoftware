import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { COMMAND_SUFFIX, meta, Options, WORKFLOW_SUFFIX } from './workflow-schema-required.config.js'

export type MessageIds = 'noSchemaVariants' | 'tooFewDecisionVariants'

const isWorkflowFile = (filename: string): boolean => filename.endsWith(WORKFLOW_SUFFIX)

const WorkflowFileName = S.NonEmptyArray(S.String)

const getWorkflowBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(WorkflowFileName)(filename.split('/')))

const isTaggedClassOrErrorCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee.type === 'CallExpression' ? node.callee.callee : node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
}

export const workflowSchemaRequired = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const baseName = getWorkflowBaseName(filename)
    const variantNames: string[] = []

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedClassOrErrorCall(node.superClass)) return
        if (node.id === null) return
        variantNames.push(node.id.name)
      },
      'Program:exit'(node: ESTree.Program) {
        const reportNode = node.body[0] ?? node

        if (variantNames.length === 0) {
          context.report({
            node: reportNode,
            messageId: 'noSchemaVariants',
            data: {
              name: baseName,
              expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
              actual: 'no S.TaggedClass or S.TaggedError declaration',
              fix:
                'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
            },
          })
          return
        }

        const nonCommandCount = variantNames.filter((name) => !name.endsWith(COMMAND_SUFFIX)).length
        if (nonCommandCount < 2) {
          context.report({
            node: reportNode,
            messageId: 'tooFewDecisionVariants',
            data: {
              name: baseName,
              expected: 'at least 2 decision or error variants',
              actual: String(nonCommandCount),
              fix:
                'mint the missing outcome as a variant, or convert this to an S.transform — a one-outcome computation is a shape conversion, not a decision',
            },
          })
        }
      },
    }
  },
})
