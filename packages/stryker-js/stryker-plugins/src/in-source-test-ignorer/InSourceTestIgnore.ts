import {
  type BinaryExpression,
  type Identifier,
  isBinaryExpression,
  isIfStatement,
  isImportMetaMember,
} from './AstNode.schema.js'

export const IN_SOURCE_TEST_IGNORED =
  'inside an `if (import.meta.vitest)` block — test code, not production behaviour' as const

export const VITEST_META_PROPERTY = 'vitest' as const

const allNamed = (pairs: readonly (readonly [Identifier, string])[]): boolean =>
  pairs.every(([access, name]) => access.name === name)

const isImportMetaVitest = (node: unknown): boolean =>
  isImportMetaMember(node) &&
  allNamed([
    [node.object.meta, 'import'],
    [node.object.property, 'meta'],
    [node.property, VITEST_META_PROPERTY],
  ])

const hasImportMetaVitestOperand = (test: BinaryExpression): boolean =>
  isImportMetaVitest(test.left) || isImportMetaVitest(test.right)

const isBinaryImportMetaVitest = (test: unknown): boolean =>
  isBinaryExpression(test) && hasImportMetaVitestOperand(test)

const guardsOnImportMetaVitest = (test: unknown): boolean => isImportMetaVitest(test) || isBinaryImportMetaVitest(test)

export const isInSourceTestGuard = (node: unknown): boolean =>
  isIfStatement(node) && guardsOnImportMetaVitest(node.test)

export const decideInSourceTestIgnore = (ancestors: Iterable<unknown>): string | undefined => {
  if ([...ancestors].some(isInSourceTestGuard)) return IN_SOURCE_TEST_IGNORED
  return undefined
}
