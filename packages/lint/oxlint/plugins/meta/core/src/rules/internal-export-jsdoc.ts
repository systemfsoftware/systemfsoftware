import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, MISSING_TAG_ACTUAL, MISSING_TAG_EXPECTED, MISSING_TAG_FIX } from './internal-export-jsdoc.config.js'
import { hasInternalTag, isExportStatement } from './internal-jsdoc.js'
import { isInternalFolder } from './internal-path.js'

export const internalExportJsdoc = defineRule({
  meta,
  create(context: Context) {
    if (!isInternalFolder(context.filename)) return {}

    const reportIfMissing = (node: ESTree.Node): void => {
      if (!isExportStatement(node)) return
      if (hasInternalTag(context, node)) return
      context.report({
        node,
        messageId: 'missingInternalTag',
        data: {
          name: 'export',
          expected: MISSING_TAG_EXPECTED,
          actual: MISSING_TAG_ACTUAL,
          fix: MISSING_TAG_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration: reportIfMissing,
      ExportDefaultDeclaration: reportIfMissing,
      ExportAllDeclaration: reportIfMissing,
    }
  },
})
