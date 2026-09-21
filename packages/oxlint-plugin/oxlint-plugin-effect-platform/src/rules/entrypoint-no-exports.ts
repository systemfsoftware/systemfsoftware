import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DEFAULT_EXPORT,
  ENTRYPOINT_EXPORT_ACTUAL,
  ENTRYPOINT_EXPORT_EXPECTED,
  ENTRYPOINT_EXPORT_FIX,
  ENTRYPOINT_FILE,
  meta,
  NAMED_EXPORT,
  STAR_EXPORT,
} from './entrypoint-no-exports.config.js'

export type MessageIds = 'entrypointExport'

const isEntrypointFile = (filename: string): boolean => ENTRYPOINT_FILE.test(filename)

export const entrypointNoExports = defineRule({
  meta,
  create(context: Context) {
    if (!isEntrypointFile(context.filename)) return {}

    const reportExport = (node: ESTree.Node, name: string): void => {
      context.report({
        node,
        messageId: 'entrypointExport',
        data: {
          name,
          expected: ENTRYPOINT_EXPORT_EXPECTED,
          actual: ENTRYPOINT_EXPORT_ACTUAL,
          fix: ENTRYPOINT_EXPORT_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        reportExport(node, NAMED_EXPORT)
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        reportExport(node, DEFAULT_EXPORT)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportExport(node, STAR_EXPORT)
      },
    }
  },
})
