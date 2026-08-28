import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  HAND_ASSERTIVE_ACTUAL,
  HAND_ASSERTIVE_EXPECTED,
  HAND_ASSERTIVE_FIX,
  meta,
} from './no-hand-assertive-test-outside-src.config.js'
import { SNAPSHOT_MATCHERS, SURFACE_SNAPSHOT_BASENAME } from './path.config.js'
import { basenameOf, isInSanctionedTestDir, isTestFile, isUnderSrc } from './path.js'

export type MessageIds = 'handAssertiveOutsideSrc'

export const noHandAssertiveTestOutsideSrc = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (isUnderSrc(filename)) return {}
    if (!isInSanctionedTestDir(filename)) return {}
    const basename = basenameOf(filename)
    if (!isTestFile(basename)) return {}
    if (basename === SURFACE_SNAPSHOT_BASENAME) return {}

    let hasSnapshotMatcher = false

    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const property = callee.property
        let name: string | undefined
        if (property.type === 'Identifier') name = property.name
        else if (property.type === 'Literal' && typeof property.value === 'string') name = property.value
        else return
        if (name !== undefined && SNAPSHOT_MATCHERS.has(name)) {
          hasSnapshotMatcher = true
        }
      },
      'Program:exit'(node: ESTree.Program) {
        if (hasSnapshotMatcher) return
        context.report({
          node,
          messageId: 'handAssertiveOutsideSrc',
          data: {
            name: basename,
            expected: HAND_ASSERTIVE_EXPECTED,
            actual: HAND_ASSERTIVE_ACTUAL,
            fix: HAND_ASSERTIVE_FIX,
          },
        })
      },
    }
  },
})
