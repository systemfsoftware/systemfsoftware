import type { Context, ESTree } from '@oxlint/plugins'

const INTERNAL_TAG = /@internal\b/i

export const hasInternalTag = (context: Context, node: ESTree.Node): boolean => {
  const sourceCode = context.sourceCode
  if ('getCommentsBefore' in sourceCode && typeof sourceCode.getCommentsBefore === 'function') {
    const comments: unknown = sourceCode.getCommentsBefore(node)
    if (Array.isArray(comments)) {
      for (const comment of comments) {
        if (
          comment !== null &&
          typeof comment === 'object' &&
          'value' in comment &&
          typeof comment.value === 'string' &&
          INTERNAL_TAG.test(comment.value)
        ) {
          return true
        }
      }
    }
  }

  return INTERNAL_TAG.test(sourceCode.getText(node, 200, 0))
}

export const isExportStatement = (
  node: ESTree.Node,
): node is ESTree.ExportNamedDeclaration | ESTree.ExportDefaultDeclaration | ESTree.ExportAllDeclaration =>
  node.type === 'ExportNamedDeclaration' ||
  node.type === 'ExportDefaultDeclaration' ||
  node.type === 'ExportAllDeclaration'
