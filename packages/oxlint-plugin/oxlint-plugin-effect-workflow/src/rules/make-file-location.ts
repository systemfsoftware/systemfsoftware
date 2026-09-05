import { defineRule } from '@oxlint/plugins'
import type { Context } from '@oxlint/plugins'
import { collectMakeBoundaries } from '@systemfsoftware/oxlint-make-boundary'
import {
  meta,
  OUTSIDE_ACTUAL,
  OUTSIDE_EXPECTED,
  OUTSIDE_FIX,
  SECOND_ACTUAL,
  SECOND_EXPECTED,
  SECOND_FIX,
  WORKFLOW_FILE_BASENAME,
} from './make-file-location.config.js'
import { basenameOf } from './ValueExports.js'

export type MessageIds = 'makeOutsideWorkflowFile' | 'secondMakeInFile'

/**
 * The construction-site rule: `Workflow.make` is the trigger, the filename is
 * part of the verdict. A misfiled construction still fires — the rule is not
 * routed by the suffix it checks, so a rename cannot silence it.
 */
export const makeFileLocation = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    const conforming = WORKFLOW_FILE_BASENAME.test(basename)
    return {
      Program() {
        const boundaries = collectMakeBoundaries(context)
        if (boundaries.length === 0) return
        if (!conforming) {
          for (const boundary of boundaries) {
            context.report({
              node: boundary.makeCall,
              messageId: 'makeOutsideWorkflowFile',
              data: {
                name: basename,
                expected: OUTSIDE_EXPECTED,
                actual: OUTSIDE_ACTUAL,
                fix: OUTSIDE_FIX,
              },
            })
          }
          return
        }
        for (const boundary of boundaries.slice(1)) {
          context.report({
            node: boundary.makeCall,
            messageId: 'secondMakeInFile',
            data: {
              name: basename,
              expected: SECOND_EXPECTED,
              actual: SECOND_ACTUAL,
              fix: SECOND_FIX,
            },
          })
        }
      },
    }
  },
})
