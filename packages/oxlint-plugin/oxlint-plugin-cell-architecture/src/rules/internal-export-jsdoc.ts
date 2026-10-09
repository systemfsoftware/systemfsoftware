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

const MISSING = {
  messageId: 'missingInternalTag',
  expected: MISSING_TAG_EXPECTED,
  actual: MISSING_TAG_ACTUAL,
  fix: MISSING_TAG_FIX,
} as const

const OUTSIDE = {
  messageId: 'internalTagOutsideFolder',
  expected: OUTSIDE_TAG_EXPECTED,
  actual: OUTSIDE_TAG_ACTUAL,
  fix: OUTSIDE_TAG_FIX,
} as const

export const internalExportJsdoc = defineRule({
  meta,
  create(context: Context) {
    const internal = isInternalFolder(context.filename)
    const violates = (node: ESTree.Node): boolean =>
      internal ? !hasRequiredInternalTag(context, node) : hasForbiddenInternalTag(context, node)
    const { messageId, expected, actual, fix } = internal ? MISSING : OUTSIDE

    const check = (node: ESTree.Node): void => {
      if (!violates(node)) return

      context.report({ node, messageId, data: { name: 'export', expected, actual, fix } })
    }

    return {
      ExportNamedDeclaration: check,
      ExportDefaultDeclaration: check,
      ExportAllDeclaration: check,
    }
  },
})
