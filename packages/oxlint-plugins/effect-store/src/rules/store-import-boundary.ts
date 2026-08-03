import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import type { Cell } from './cell.js'
import { cellOf, isStoreFile } from './cell.js'
import {
  ADAPTER_IMPORT_ACTUAL,
  ADAPTER_IMPORT_EXPECTED,
  ADAPTER_IMPORT_FIX,
  EXECUTOR_IMPORT_ACTUAL,
  EXECUTOR_IMPORT_EXPECTED,
  EXECUTOR_IMPORT_FIX,
  HANDLER_IMPORT_ACTUAL,
  HANDLER_IMPORT_EXPECTED,
  HANDLER_IMPORT_FIX,
  meta,
  MIDDLEWARE_IMPORT_ACTUAL,
  MIDDLEWARE_IMPORT_EXPECTED,
  MIDDLEWARE_IMPORT_FIX,
  STORE_IMPORT_ACTUAL,
  STORE_IMPORT_EXPECTED,
  STORE_IMPORT_FIX,
} from './store-import-boundary.config.js'

export type MessageIds = 'storeImport' | 'executorImport' | 'handlerImport' | 'middlewareImport' | 'adapterImport'

type BoundaryData = {
  readonly messageId: MessageIds
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

const boundaryDataFor = (cell: Cell | null): BoundaryData | null => {
  if (cell === null) return null
  if (cell === 'store') {
    return {
      messageId: 'storeImport',
      expected: STORE_IMPORT_EXPECTED,
      actual: STORE_IMPORT_ACTUAL,
      fix: STORE_IMPORT_FIX,
    }
  }
  if (cell === 'executor') {
    return {
      messageId: 'executorImport',
      expected: EXECUTOR_IMPORT_EXPECTED,
      actual: EXECUTOR_IMPORT_ACTUAL,
      fix: EXECUTOR_IMPORT_FIX,
    }
  }
  if (cell === 'handler') {
    return {
      messageId: 'handlerImport',
      expected: HANDLER_IMPORT_EXPECTED,
      actual: HANDLER_IMPORT_ACTUAL,
      fix: HANDLER_IMPORT_FIX,
    }
  }
  if (cell === 'middleware') {
    return {
      messageId: 'middlewareImport',
      expected: MIDDLEWARE_IMPORT_EXPECTED,
      actual: MIDDLEWARE_IMPORT_ACTUAL,
      fix: MIDDLEWARE_IMPORT_FIX,
    }
  }
  if (cell === 'adapter') {
    return {
      messageId: 'adapterImport',
      expected: ADAPTER_IMPORT_EXPECTED,
      actual: ADAPTER_IMPORT_ACTUAL,
      fix: ADAPTER_IMPORT_FIX,
    }
  }
  return null
}

export const storeImportBoundary = defineRule({
  meta,
  create(context: Context) {
    if (!isStoreFile(context.filename)) return {}

    const reportBoundary = (source: string, node: ESTree.Node): void => {
      const boundary = boundaryDataFor(cellOf(source))
      if (boundary === null) return
      context.report({
        node,
        messageId: boundary.messageId,
        data: {
          name: source,
          expected: boundary.expected,
          actual: boundary.actual,
          fix: boundary.fix,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportBoundary(node.source.value, node)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const sourceNode = node.source
        if (sourceNode.type !== 'Literal') return
        if (typeof sourceNode.value !== 'string') return
        reportBoundary(sourceNode.value, node)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        reportBoundary(node.source.value, node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportBoundary(node.source.value, node)
      },
    }
  },
})
