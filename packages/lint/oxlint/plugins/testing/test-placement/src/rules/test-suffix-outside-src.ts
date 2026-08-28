import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { INTEGRATION_SUFFIX, SURFACE_SNAPSHOT_BASENAME } from './path.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import {
  meta,
  UNSANCTIONED_SUFFIX_ACTUAL,
  UNSANCTIONED_SUFFIX_EXPECTED,
  UNSANCTIONED_SUFFIX_FIX,
} from './test-suffix-outside-src.config.js'

export type MessageIds = 'unsanctionedSuffix'

export const testSuffixOutsideSrc = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    const suffixIsAllowed = basename.endsWith(INTEGRATION_SUFFIX) || basename === SURFACE_SNAPSHOT_BASENAME
    return {
      Program(node: ESTree.Program) {
        if (isUnderSrc(filename)) return
        if (!isTestFile(basename)) return
        if (suffixIsAllowed) return
        context.report({
          node,
          messageId: 'unsanctionedSuffix',
          data: {
            name: basename,
            expected: UNSANCTIONED_SUFFIX_EXPECTED,
            actual: UNSANCTIONED_SUFFIX_ACTUAL,
            fix: UNSANCTIONED_SUFFIX_FIX,
          },
        })
      },
    }
  },
})
