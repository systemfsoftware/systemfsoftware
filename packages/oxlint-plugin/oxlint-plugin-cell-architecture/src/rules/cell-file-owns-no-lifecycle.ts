import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { actualOf, EXPECTED, FIX, LIFECYCLE_MEMBERS, meta } from './cell-file-owns-no-lifecycle.config.js'
import { effectMemberIs } from './effect-origin.js'
import { isCellFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'lifecycleOwnership'

const memberNameOf = (callee: ESTree.Node): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type !== 'MemberExpression') return null
  return callee.property.type === 'Identifier' ? callee.property.name : null
}

export const cellFileOwnsNoLifecycle = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename) || isCellFile(context.filename) === false) return {}
    const getScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (effectMemberIs(node.callee, getScope, LIFECYCLE_MEMBERS) === false) return
        context.report({
          node,
          messageId: 'lifecycleOwnership',
          data: {
            name: memberNameOf(node.callee) ?? 'a lifecycle effect',
            expected: EXPECTED,
            actual: actualOf(memberNameOf(node.callee) ?? 'a lifecycle effect'),
            fix: FIX,
          },
        })
      },
    }
  },
})
