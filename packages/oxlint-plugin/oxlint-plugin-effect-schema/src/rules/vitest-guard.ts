import type { ESTree } from '@oxlint/plugins'

const isImportMetaVitest = (node: ESTree.Node | null): boolean =>
  node !== null &&
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'MetaProperty' &&
  node.object.meta.type === 'Identifier' &&
  node.object.meta.name === 'import' &&
  node.object.property.type === 'Identifier' &&
  node.object.property.name === 'meta' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest'

const isUndefinedSentinel = (node: ESTree.Node): boolean =>
  (node.type === 'UnaryExpression' && node.operator === 'void' && node.argument.type === 'Literal' &&
    node.argument.value === 0) ||
  (node.type === 'Literal' && node.value === null) ||
  (node.type === 'Identifier' && node.name === 'undefined')

export const isImportMetaVitestTest = (test: ESTree.Node | null): boolean => {
  if (isImportMetaVitest(test)) return true
  if (test !== null && test.type === 'BinaryExpression') {
    const binary = test
    if (binary.operator !== '!==' && binary.operator !== '!=') return false
    return (
      (isImportMetaVitest(binary.left) && isUndefinedSentinel(binary.right)) ||
      (isUndefinedSentinel(binary.left) && isImportMetaVitest(binary.right))
    )
  }
  return false
}

export const isInsideConsequent = (
  node: { readonly parent: ESTree.Node | null },
  consequent: ESTree.Node,
): boolean => {
  const walk = (current: ESTree.Node | null): boolean => {
    if (current === null) return false
    if (current === consequent) return true
    return walk(current.parent)
  }
  return walk(node.parent)
}
