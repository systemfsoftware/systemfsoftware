import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './kernel-no-throw.config.js'

export type MessageIds = 'throwStatement'

const isKernelFile = (filename: string): boolean => filename.endsWith('.kernel.ts')

export const kernelNoThrow = defineRule({
  meta,
  create(context: Context) {
    if (!isKernelFile(context.filename)) return {}

    return {
      ThrowStatement(node: ESTree.ThrowStatement) {
        context.report({
          node,
          messageId: 'throwStatement',
          data: {
            name: 'throw',
            expected: 'a total function returning the failure as data (Option.none, Either.left, or a result value)',
            actual: 'a thrown exception',
            fix: 'return the failure as a value so every call path stays total — a kernel never throws',
          },
        })
      },
    }
  },
})
