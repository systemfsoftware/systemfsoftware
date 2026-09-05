import type { ESTree } from '@oxlint/plugins'

/** True when `node` is the `import.meta.vitest` member expression itself. */
export const isMetaVitest = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest' &&
  node.object.type === 'MetaProperty'

/**
 * True when `test` is the condition of an in-source test block — `import.meta.vitest` bare,
 * or compared against a sentinel on either side.
 *
 * Shared by the rules that must recognise an in-source block without judging its contents.
 */
export const isVitestGuard = (test: ESTree.Node): boolean => {
  if (isMetaVitest(test)) return true
  if (test.type !== 'BinaryExpression') return false
  return isMetaVitest(test.left) || isMetaVitest(test.right)
}
