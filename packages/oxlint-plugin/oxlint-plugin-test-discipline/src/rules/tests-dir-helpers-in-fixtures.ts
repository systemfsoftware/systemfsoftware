import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basenameOf, directoriesOf, isTestFile, isUnderSrc } from './path.js'
import { HELPER_ACTUAL, HELPER_EXPECTED, HELPER_FIX, meta } from './tests-dir-helpers-in-fixtures.config.js'

export type MessageIds = 'helperOutsideFixtures'

export const testsDirHelpersInFixtures = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (isUnderSrc(filename)) return {}
    const basename = basenameOf(filename)
    if (isTestFile(basename)) return {}
    const dirs = directoriesOf(filename)
    if (!dirs.includes('tests')) return {}
    if (dirs.includes('__fixtures__')) return {}
    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'helperOutsideFixtures',
          data: { name: basename, expected: HELPER_EXPECTED, actual: HELPER_ACTUAL, fix: HELPER_FIX },
        })
      },
    }
  },
})
