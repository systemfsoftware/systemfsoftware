import type { ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'

export const EXECUTOR_SUFFIX = '.executor.ts'

export const isExecutorFile = (filename: string): boolean => filename.endsWith(EXECUTOR_SUFFIX)

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

const WORD_SEPARATORS = /[-_.]/

const pascalCase = (stem: string): string =>
  stem
    .split(WORD_SEPARATORS)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join('')

/** `confirm-order.executor.ts` -> `ConfirmOrderExecutorDeps`. */
export const expectedDepsTagName = (filename: string): string => {
  const basename = lastSegmentOf(filename)
  return `${pascalCase(basename.slice(0, -EXECUTOR_SUFFIX.length))}ExecutorDeps`
}

/** `saveOrder(...)` -> `saveOrder`; `Store.save(...)` -> `Store`. */
export const calleeRootName = (callee: ESTree.Node): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type !== 'MemberExpression') return null
  return calleeRootName(callee.object)
}
