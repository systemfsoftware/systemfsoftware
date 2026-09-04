import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { WORKFLOW_FILE_BASENAME } from './make-file-location.config.js'
import { basenameOf, walkExportedValues } from './ValueExports.js'
import {
  EXTRA_ACTUAL,
  EXTRA_FIX,
  meta,
  MISSING_ACTUAL,
  MISSING_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  SIGNATURE_EXPECTED,
} from './workflow-file-export-topology.config.js'

export type MessageIds = 'extraValueExport' | 'missingValueExport' | 'reexportFromWorkflowFile'

export const workflowFileExportTopology = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!WORKFLOW_FILE_BASENAME.test(basename)) return {}
    const reportReexport = (target: ESTree.Node, source: string): void => {
      context.report({
        node: target,
        messageId: 'reexportFromWorkflowFile',
        data: {
          name: 'a re-export',
          expected: REEXPORT_EXPECTED,
          actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
          fix: REEXPORT_FIX,
        },
      })
    }
    return {
      Program(node: ESTree.Program) {
        const valueExports: ESTree.Node[] = []
        walkExportedValues(node, {
          onValue: (value) => {
            valueExports.push(value.node)
          },
          onReexport: (target, source) => {
            reportReexport(target, source)
          },
        })
        if (valueExports.length === 0) {
          context.report({
            node,
            messageId: 'missingValueExport',
            data: {
              name: basename,
              expected: SIGNATURE_EXPECTED,
              actual: MISSING_ACTUAL,
              fix: MISSING_FIX,
            },
          })
          return
        }
        for (const extra of valueExports.slice(1)) {
          context.report({
            node: extra,
            messageId: 'extraValueExport',
            data: {
              name: basename,
              expected: SIGNATURE_EXPECTED,
              actual: EXTRA_ACTUAL,
              fix: EXTRA_FIX,
            },
          })
        }
      },
    }
  },
})
