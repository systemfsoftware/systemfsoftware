import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  SCHEMA_TEST_ACTUAL,
  SCHEMA_TEST_EXPECTED,
  SCHEMA_TEST_FIX,
  TEST_FILE_IN_SRC_ACTUAL,
  TEST_FILE_IN_SRC_EXPECTED,
  TEST_FILE_IN_SRC_FIX,
} from './no-test-file-in-src.config.js'
import { PROPERTY_SUFFIX, SCHEMA_LAWS_BASENAME, SCHEMA_SUFFIX } from './path.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'

export type MessageIds = 'testFileInSrc' | 'schemaTestInSrc'

interface Violation {
  readonly messageId: MessageIds
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

const SCHEMA_TEST: Violation = {
  messageId: 'schemaTestInSrc',
  expected: SCHEMA_TEST_EXPECTED,
  actual: SCHEMA_TEST_ACTUAL,
  fix: SCHEMA_TEST_FIX,
}

const UNSANCTIONED: Violation = {
  messageId: 'testFileInSrc',
  expected: TEST_FILE_IN_SRC_EXPECTED,
  actual: TEST_FILE_IN_SRC_ACTUAL,
  fix: TEST_FILE_IN_SRC_FIX,
}

export const noTestFileInSrc = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!isUnderSrc(context.filename)) return {}
    if (!isTestFile(basename)) return {}
    if (basename === SCHEMA_LAWS_BASENAME) return {}
    if (basename.endsWith(PROPERTY_SUFFIX)) return {}
    const { messageId, ...detail } = basename.endsWith(SCHEMA_SUFFIX) ? SCHEMA_TEST : UNSANCTIONED
    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId,
          data: { name: basename, ...detail },
        })
      },
    }
  },
})
