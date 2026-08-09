import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ERROR_REWRITING_METHODS, meta } from './policy-no-error-rewriting.config.js'

export type MessageIds = 'errorRewriting'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

const rewritingMethodOfMember = (member: ESTree.MemberExpression): string | null => {
  if (member.object.type !== 'Identifier' || member.object.name !== 'Effect') return null
  if (member.property.type !== 'Identifier') return null
  if (!ERROR_REWRITING_METHODS.includes(member.property.name)) return null
  return member.property.name
}

const errorRewritingMethod = (node: ESTree.CallExpression): string | null => {
  if (node.callee.type !== 'MemberExpression') return null
  return rewritingMethodOfMember(node.callee)
}

export const policyNoErrorRewriting = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const reportRewriting = (node: ESTree.Node, method: string): void => {
      context.report({
        node,
        messageId: 'errorRewriting',
        data: {
          name: `Effect.${method}`,
          expected: "the caller's error channel E unchanged — only Xi refusals may be added",
          actual: 'a call that rewrites, swallows, or removes E',
          fix: 'observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry',
        },
      })
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        const method = errorRewritingMethod(node)
        if (method === null) return
        reportRewriting(node, method)
      },
      MemberExpression(node: ESTree.MemberExpression) {
        // The CallExpression visitor already reports Effect.<method>(…) — skip callee
        // position so a direct call is not double-reported. A bare Effect.<method>
        // reference (e.g. self.pipe(Effect.orDie)) is still a use of a combinator
        // that rewrites E and must be reported.
        if (node.parent.type === 'CallExpression' && node.parent.callee === node) return
        const method = rewritingMethodOfMember(node)
        if (method === null) return
        reportRewriting(node, method)
      },
    }
  },
})
