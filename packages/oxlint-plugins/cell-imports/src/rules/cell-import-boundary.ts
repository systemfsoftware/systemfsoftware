import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import type { CellEdge } from '../cell-import-table.config.js'
import {
  CELL_IMPORT_TABLE,
  MODULE_EXTENSION,
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

const cellOf = (specifier: string): string | null => {
  const segments = specifier.split('/').filter((segment) => segment.length > 0)
  const last = segments.at(-1)
  if (last === undefined) return null
  const stem = last.replace(MODULE_EXTENSION, '')
  const dot = stem.lastIndexOf('.')
  if (dot <= 0) return null
  return stem.slice(dot)
}

const edgeFor = (filename: string): CellEdge | null => {
  let matched: CellEdge | null = null
  let matchedLength = 0
  for (const [suffix, edge] of Object.entries(CELL_IMPORT_TABLE)) {
    if (!filename.endsWith(suffix)) continue
    if (suffix.length <= matchedLength) continue
    matched = edge
    matchedLength = suffix.length
  }
  return matched
}

const isProductionCaller = (filename: string): boolean =>
  !NON_PRODUCTION_CALLER.some((pattern) => pattern.test(filename))

const hasValueBinding = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  if (node.specifiers.length === 0) return true
  return !node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

const traversesSegment = (filename: string, specifier: string, segment: string): boolean => {
  if (!specifier.startsWith('.')) return specifier.split('/').includes(segment)
  const resolved = filename.split('/').slice(0, -1)
  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved.slice(0, -1).includes(segment)
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
    if (edge === null && !guardsObserver) return {}

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
        if (node.source === null || node.source === undefined) return
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
