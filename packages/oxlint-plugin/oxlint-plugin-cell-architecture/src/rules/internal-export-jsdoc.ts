import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  MISSING_TAG_ACTUAL,
  MISSING_TAG_EXPECTED,
  MISSING_TAG_FIX,
  OUTSIDE_TAG_ACTUAL,
  OUTSIDE_TAG_EXPECTED,
  OUTSIDE_TAG_FIX,
} from './internal-export-jsdoc.config.js'
import { hasForbiddenInternalTag, hasRequiredInternalTag } from './internal-jsdoc.js'

import { isInternalFolder } from './internal-path.js'

/** One predicate, both directions: an export carries `@internal` if and only if its path has an `internal` segment. */
export const internalExportJsdoc = defineRule({
  meta,
  create(context: Context) {
    const internal = isInternalFolder(context.filename)

    const reportIfMissing = (node: ESTree.Node): void => {
      if (hasRequiredInternalTag(context, node)) return

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

    const reportIfTagged = (node: ESTree.Node): void => {
      if (!hasForbiddenInternalTag(context, node)) return

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

    const check = internal ? reportIfMissing : reportIfTagged

    return {
      ExportNamedDeclaration: check,
      ExportDefaultDeclaration: check,
      ExportAllDeclaration: check,
    }
  },
})
