import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import { meta } from './no-assert-in-property.config.js'
import { isPropCallee } from './prop-call.js'

export type MessageIds = 'expectCall' | 'assertCall' | 'rawFcRun'

const ASSERT_IDENTIFIER = /^assert/
const FC_RUN_METHODS: ReadonlySet<string> = new Set(['assert', 'check'])

const isInsidePropPredicate = (node: ESTree.Node): boolean => {
  const parent = node.parent
  if (parent === null) return false
  if (
    (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') &&
    Option.fromNullishOr(parent.parent).pipe(
      Option.exists((grandparent) => grandparent.type === 'CallExpression' && isPropCallee(grandparent.callee)),
    )
  ) {
    return true
  }
  return isInsidePropPredicate(parent)
}

export const noAssertInProperty = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        let finding: { messageId: MessageIds; name: string } | null = null
        if (callee.type === 'Identifier') {
          if (callee.name === 'expect') {
            finding = { messageId: 'expectCall', name: 'expect(...)' }
          } else if (ASSERT_IDENTIFIER.test(callee.name)) {
            finding = { messageId: 'assertCall', name: `${callee.name}(...)` }
          }
        } else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
          if (callee.object.type === 'Identifier' && callee.object.name === 'assert') {
            finding = { messageId: 'assertCall', name: `assert.${callee.property.name}(...)` }
          } else if (
            callee.object.type === 'Identifier' && callee.object.name === 'fc' &&
            FC_RUN_METHODS.has(callee.property.name)
          ) {
            finding = { messageId: 'rawFcRun', name: `fc.${callee.property.name}(...)` }
          }
        }
        if (finding === null || !isInsidePropPredicate(node)) return
        context.report({
          node,
          messageId: finding.messageId,
          data: {
            name: `${finding.name} inside a property predicate`,
            expected: 'return <boolean> — the boolean return IS the verdict in it.prop / it.effect.prop',
            actual: `${finding.name} forks the failure channel (throw vs false)`,
            fix:
              'compute the value, then return a single boolean expression; assert* stays correct in normal (non-property) tests',
          },
        })
      },
    }
  },
})
