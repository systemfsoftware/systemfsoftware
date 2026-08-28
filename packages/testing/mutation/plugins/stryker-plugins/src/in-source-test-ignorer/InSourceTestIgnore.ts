import { isBinaryExpression, isIfStatement, isImportMetaMember } from './AstNode.schema.js'

/** @public */
export const IN_SOURCE_TEST_IGNORED =
  'inside an `if (import.meta.vitest)` block — test code, not production behaviour' as const

export const VITEST_META_PROPERTY = 'vitest' as const

const isImportMetaVitest = (node: unknown): boolean =>
  isImportMetaMember(node) &&
  node.object.meta.name === 'import' &&
  node.object.property.name === 'meta' &&
  node.property.name === VITEST_META_PROPERTY

const guardsOnImportMetaVitest = (test: unknown): boolean =>
  isImportMetaVitest(test) ||
  (isBinaryExpression(test) && (isImportMetaVitest(test.left) || isImportMetaVitest(test.right)))
/** @public */
export const isInSourceTestGuard = (node: unknown): boolean =>
  isIfStatement(node) && guardsOnImportMetaVitest(node.test)

/** @public */
export const decideInSourceTestIgnore = (ancestors: Iterable<unknown>): string | undefined => {
  for (const ancestor of ancestors) {
    if (isInSourceTestGuard(ancestor)) return IN_SOURCE_TEST_IGNORED
  }
  return undefined
}
