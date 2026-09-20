import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basenameOf, isInSanctionedTestDir, isTestFile, isUnderSrc } from './path.js'
import {
  meta,
  STRAY_TEST_FILE_ACTUAL,
  STRAY_TEST_FILE_EXPECTED,
  STRAY_TEST_FILE_FIX,
} from './test-file-outside-tests-dir.config.js'

export type MessageIds = 'strayTestFile'

export const testFileOutsideTestsDir = defineRule({
  meta,
  create(context: Context) {
    if (isUnderSrc(context.filename)) return {}
    if (!isTestFile(basenameOf(context.filename))) return {}
    if (isInSanctionedTestDir(context.filename)) return {}
    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'strayTestFile',
          data: {
            name: basenameOf(context.filename),
            expected: STRAY_TEST_FILE_EXPECTED,
            actual: STRAY_TEST_FILE_ACTUAL,
            fix: STRAY_TEST_FILE_FIX,
          },
        })
      },
    }
  },
})
