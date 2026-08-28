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
    const basename = basenameOf(filename)
    if (
      isUnderSrc(filename) || !isInSanctionedTestDir(filename) || !isTestFile(basename) ||
      basename === SURFACE_SNAPSHOT_BASENAME
    ) return {}

    let hasSnapshotMatcher = false

    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const property = callee.property
        const name = property.type === 'Identifier'
          ? property.name
          : property.type === 'Literal' && typeof property.value === 'string'
          ? property.value
          : undefined
        if (name !== undefined && SNAPSHOT_MATCHERS.has(name)) hasSnapshotMatcher = true
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
