import type { ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'

export const STORE_SUFFIX = '.store.ts'

export const isStoreFile = (filename: string): boolean => filename.endsWith(STORE_SUFFIX)

const PathSegments = S.NonEmptyArray(S.String)

export const lastSegmentOf = (source: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(PathSegments)(source.split('/')))

export const CELL_SUFFIXES = [
  'workflow',
  'acl',
  'store',
  'adapter',
  'shape',
  'executor',
  'handler',
  'middleware',
  'policy',
  'state',
  'observer',
  'kernel',
  'schema',
] as const

export type Cell = typeof CELL_SUFFIXES[number]

const MODULE_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts'] as const

const stripExtension = (segment: string): string => {
  const extension = MODULE_EXTENSIONS.find((candidate) => segment.endsWith(candidate))
  return extension === undefined ? segment : segment.slice(0, -extension.length)
}

export const cellOf = (source: string): Cell | null => {
  const stem = stripExtension(lastSegmentOf(source))
  return CELL_SUFFIXES.find((cell) => stem.endsWith(`.${cell}`)) ?? null
}

/** `saveOrder(...)` -> `saveOrder`; `Store.save(...)` -> `Store`. */
export const calleeRootName = (callee: ESTree.Node): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type !== 'MemberExpression') return null
  return calleeRootName(callee.object)
}
