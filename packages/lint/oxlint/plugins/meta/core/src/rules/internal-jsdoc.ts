import type { Context, ESTree } from '@oxlint/plugins'

/** A JSDoc tag at the start of a comment line, not a mid-sentence mention. */
const REQUIRED_TAG = /^\s*\*?\s*@internal\b/m
const FORBIDDEN_TAG = /^\s*\*?\s*@Internal\b/im

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
