import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { WORKFLOW_FILE_BASENAME } from './make-file-location.config.js'
import { hasMakeBoundary } from './MakeBoundary.js'
import { basenameOf } from './ValueExports.js'
import {
  meta,
  WITHOUT_MAKE_ACTUAL,
  WITHOUT_MAKE_EXPECTED,
  WITHOUT_MAKE_FIX,
} from './workflow-file-make-presence.config.js'

export type MessageIds = 'workflowFileWithoutMake'

export const workflowFileMakePresence = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!WORKFLOW_FILE_BASENAME.test(basename)) return {}
    return {
      Program(program: ESTree.Program) {
        if (!hasMakeBoundary(context)) {
          context.report({
            node: program,
            messageId: 'workflowFileWithoutMake',
            data: {
              name: basename,
              expected: WITHOUT_MAKE_EXPECTED,
              actual: WITHOUT_MAKE_ACTUAL,
              fix: WITHOUT_MAKE_FIX,
            },
          })
        }
      },
    }
  },
})
