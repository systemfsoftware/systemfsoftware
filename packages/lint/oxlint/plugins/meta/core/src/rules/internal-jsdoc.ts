import type { Context, ESTree } from '@oxlint/plugins'

const REQUIRED_TAG = /@internal\b/
const FORBIDDEN_TAG = /@internal\b/i

const commentsCarry = (context: Context, node: ESTree.Node, pattern: RegExp): boolean => {
  for (const comment of context.sourceCode.getCommentsBefore(node)) {
    if (pattern.test(comment.value)) return true
  }
  return false
}

export const hasRequiredInternalTag = (context: Context, node: ESTree.Node): boolean =>
  commentsCarry(context, node, REQUIRED_TAG)

export const hasForbiddenInternalTag = (context: Context, node: ESTree.Node): boolean =>
  commentsCarry(context, node, FORBIDDEN_TAG)
