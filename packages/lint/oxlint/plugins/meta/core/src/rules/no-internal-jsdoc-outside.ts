import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { hasInternalTag, isExportStatement } from './internal-jsdoc.js'
import { isInternalFolder } from './internal-path.js'
import { meta, OUTSIDE_TAG_ACTUAL, OUTSIDE_TAG_EXPECTED, OUTSIDE_TAG_FIX } from './no-internal-jsdoc-outside.config.js'

export const noInternalJsdocOutside = defineRule({
  meta,
  create(context: Context) {
    if (isInternalFolder(context.filename)) return {}

    const reportIfTagged = (node: ESTree.Node): void => {
      if (!isExportStatement(node)) return
      if (!hasInternalTag(context, node)) return
      context.report({
        node,
        messageId: 'internalTagOutsideFolder',
        data: {
          name: 'export',
          expected: OUTSIDE_TAG_EXPECTED,
          actual: OUTSIDE_TAG_ACTUAL,
          fix: OUTSIDE_TAG_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration: reportIfTagged,
      ExportDefaultDeclaration: reportIfTagged,
      ExportAllDeclaration: reportIfTagged,
    }
  },
})
