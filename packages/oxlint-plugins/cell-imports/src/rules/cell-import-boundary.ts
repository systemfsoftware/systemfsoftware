import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { dirname, join, normalize } from '@std/path/posix'
import type { CellEdge } from '../cell-import-table.config.js'
import {
  CELL_IMPORT_TABLE,
  finalPathStem,
  NON_PRODUCTION_CALLER,
  OBSERVER_MODULE,
} from '../cell-import-table.config.js'
import {
  CELL_EXPECTED,
  CELL_FIX,
  meta,
  OBSERVER_EXPECTED,
  OBSERVER_FIX,
  RUNTIME_EXPECTED,
  RUNTIME_FIX,
  VALUE_EXPECTED,
  VALUE_FIX,
} from './cell-import-boundary.config.js'

export type MessageIds =
  | 'forbiddenCellImport'
  | 'forbiddenValueImport'
  | 'forbiddenRuntimeImport'
  | 'forbiddenObserverImport'

export const cellOf = (specifier: string): string | null => {
  const stem = finalPathStem(specifier)
  if (stem === null) return null
  const dot = stem.lastIndexOf('.')
  if (dot <= 0) return null
  return stem.slice(dot)
}

const edgeFor = (filename: string): CellEdge | null => {
  for (const [suffix, edge] of Object.entries(CELL_IMPORT_TABLE)) {
    if (filename.endsWith(suffix)) return edge
  }
  return null
}

const isProductionCaller = (filename: string): boolean =>
  !NON_PRODUCTION_CALLER.some((pattern) => pattern.test(filename))

export const hasValueBinding = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  if (node.specifiers.length === 0) return true
  return !node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

const traversesSegment = (filename: string, specifier: string, segment: string): boolean => {
  if (!specifier.startsWith('.')) return specifier.split('/').includes(segment)
  const resolved = normalize(join(dirname(filename), specifier)).split('/')
  return resolved.includes(segment)
}

const isExempt = (edge: CellEdge, filename: string, specifier: string, cell: string): boolean => {
  const exception = edge.exceptVia
  if (exception === undefined) return false
  if (!exception.cells.includes(cell)) return false
  return traversesSegment(filename, specifier, exception.segment)
}

export const cellImportBoundary = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const edge = edgeFor(filename)
    const guardsObserver = isProductionCaller(filename)

    const inspect = (node: ESTree.Node, specifier: string, valueBinding: boolean): void => {
      if (guardsObserver && OBSERVER_MODULE.test(specifier)) {
        context.report({
          node,
          messageId: 'forbiddenObserverImport',
          data: {
            name: specifier,
            expected: OBSERVER_EXPECTED,
            actual: 'a production module reaching into the observer frame',
            fix: OBSERVER_FIX,
          },
        })
        return
      }
      if (edge === null) return

      if (edge.forbidRuntime?.test(specifier) === true) {
        context.report({
          node,
          messageId: 'forbiddenRuntimeImport',
          data: {
            name: specifier,
            expected: RUNTIME_EXPECTED,
            actual: 'a direct import of a node runtime module',
            fix: RUNTIME_FIX,
          },
        })
        return
      }

      const cell = cellOf(specifier)
      if (cell === null) return

      if (edge.forbid.includes(cell)) {
        if (isExempt(edge, filename, specifier, cell)) return
        context.report({
          node,
          messageId: 'forbiddenCellImport',
          data: {
            name: specifier,
            expected: CELL_EXPECTED,
            actual: `an import of the ${cell} cell`,
            fix: CELL_FIX,
          },
        })
        return
      }

      if (valueBinding && edge.forbidValue?.includes(cell) === true) {
        context.report({
          node,
          messageId: 'forbiddenValueImport',
          data: {
            name: specifier,
            expected: VALUE_EXPECTED,
            actual: `a value import of the ${cell} cell`,
            fix: VALUE_FIX,
          },
        })
      }
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        inspect(node, node.source.value, hasValueBinding(node))
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        inspect(node, node.source.value, node.exportKind !== 'type')
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        inspect(node, node.source.value, node.exportKind !== 'type')
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal') return
        const value = node.source.value
        if (typeof value !== 'string') return
        inspect(node, value, true)
      },
    }
  },
})
