import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import { meta, OptionsElement, TAG_NAME } from './no-direct-tag-access.config.js'

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'forbidden'

const isTagProperty = (prop: ESTree.Node): boolean =>
  (prop.type === 'Identifier' && prop.name === TAG_NAME) ||
  (prop.type === 'Literal' && prop.value === TAG_NAME)

const isInComparisonOrSwitch = (node: ESTree.MemberExpression): boolean => {
  const parent = node.parent
  if (
    parent.type === 'BinaryExpression' &&
    (parent.operator === '===' || parent.operator === '!==')
  ) {
    return true
  }
  if (parent.type === 'SwitchStatement') {
    return true
  }
  return false
}

export const noDirectTagAccess = defineRule({
  meta,
  create(context) {
    // Scope: a `.tst.ts` file is a type-test fixture that must contain no runtime
    // values — its branch exists only to give the type checker two channels to
    // discriminate, and the direct `_tag` comparison is the point of the test.
    // The boundary is a property of what a type-test file *is*, not of any package.
    if (context.filename.endsWith('.tst.ts')) return {}

    const options = S.decodeUnknownSync(OptionsElement)(context.options[0] ?? {})
    const allow = new Set(options.allow)
    const { expected, fix } = options

    return {
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isTagProperty(node.property)) return
        if (!isInComparisonOrSwitch(node)) return

        const source = context.sourceCode.getText(node.object)
        const accessName = `${source}._tag`
        if (allow.has(accessName)) return

        context.report({
          node: node.property,
          messageId: 'forbidden',
          data: {
            name: accessName,
            expected,
            actual: 'direct _tag property access',
            fix,
          },
        })
      },
    }
  },
})
