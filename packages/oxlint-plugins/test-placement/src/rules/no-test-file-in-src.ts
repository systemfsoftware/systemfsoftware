import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  TEST_FILE_IN_SRC_ACTUAL,
  TEST_FILE_IN_SRC_EXPECTED,
  TEST_FILE_IN_SRC_FIX,
} from './no-test-file-in-src.config.js'
import { PROPERTY_SUFFIX } from './path.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'

export type MessageIds = 'testFileInSrc'

export const noTestFileInSrc = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!isUnderSrc(context.filename)) return {}
    if (!isTestFile(basename)) return {}
    if (basename.endsWith(PROPERTY_SUFFIX)) return {}
    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'testFileInSrc',
          data: {
            name: basename,
            expected: TEST_FILE_IN_SRC_EXPECTED,
            actual: TEST_FILE_IN_SRC_ACTUAL,
            fix: TEST_FILE_IN_SRC_FIX,
          },
        })
      },
    }
  },
})
