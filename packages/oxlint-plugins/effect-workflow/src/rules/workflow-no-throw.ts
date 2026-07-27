import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './workflow-no-throw.config.js'

export type MessageIds = 'throwStatement'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

export const workflowNoThrow = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    return {
      ThrowStatement(node: ESTree.ThrowStatement) {
        context.report({
          node,
          messageId: 'throwStatement',
          data: {
            name: 'throw',
            expected: 'a typed failure returned in the Either error channel',
            actual: 'a thrown exception',
            fix:
              'return Either.left with an S.TaggedError variant, or let the invariant surface as a defect at the shell edge',
          },
        })
      },
    }
  },
})
