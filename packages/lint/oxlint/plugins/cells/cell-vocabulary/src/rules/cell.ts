import type { ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'

const PathSegments = S.NonEmptyArray(S.String)

export const lastSegmentOf = (source: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(PathSegments)(source.split('/')))

const MODULE_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts'] as const

const stripExtension = (segment: string): string => {
  const extension = MODULE_EXTENSIONS.find((candidate) => segment.endsWith(candidate))
  return extension === undefined ? segment : segment.slice(0, -extension.length)
}

/**
 * The cell a module source belongs to, restricted to the walked I/O cells: a source
 * whose last segment ends in one of those cell suffixes is an I/O module, and a
 * binding imported from it is an I/O binding. The suffix set rides the import edge
 * and is never inferred from an identifier's spelling (EE1).
 */
export const cellOf = (source: string, cells: readonly string[]): string | null => {
  const stem = stripExtension(lastSegmentOf(source))
  return cells.find((cell) => stem.endsWith(`.${cell}`)) ?? null
}

export const calleeRootName = (callee: ESTree.Node): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type !== 'MemberExpression') return null
  return calleeRootName(callee.object)
}

export const isCellMemberCall = (
  node: ESTree.Node,
  namespaces: ReadonlySet<string>,
  memberName: string,
): node is ESTree.CallExpression & { callee: ESTree.MemberExpression } => {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed) return false
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier') return false
  if (property.type !== 'Identifier') return false
  if (!namespaces.has(object.name)) return false
  return property.name === memberName
}
