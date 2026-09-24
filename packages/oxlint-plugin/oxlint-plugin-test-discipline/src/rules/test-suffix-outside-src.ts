import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { CONFORMANCE_SUFFIX, DIFFERENTIAL_SUFFIX, INTEGRATION_SUFFIX, TRACE_SUFFIX } from './path.config.js'
import { basenameOf, isRawVitestPackage, isTestFile, isUnderSrc } from './path.js'
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
    if (isUnderSrc(filename)) return {}
    if (isRawVitestPackage(filename)) return {}
    const basename = basenameOf(filename)
    if (!isTestFile(basename)) return {}
    if (
      basename.endsWith(INTEGRATION_SUFFIX) || basename.endsWith(DIFFERENTIAL_SUFFIX) ||
      basename.endsWith(TRACE_SUFFIX) || basename.endsWith(CONFORMANCE_SUFFIX)
    ) return {}
    return {
      Program(node: ESTree.Program) {
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
