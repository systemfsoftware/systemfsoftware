import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { cellOf, isExecutorFile } from './cell.js'
import {
  ADAPTER_VALUE_IMPORT_ACTUAL,
  ADAPTER_VALUE_IMPORT_EXPECTED,
  ADAPTER_VALUE_IMPORT_FIX,
  EXECUTOR_IMPORT_ACTUAL,
  EXECUTOR_IMPORT_EXPECTED,
  EXECUTOR_IMPORT_FIX,
  meta,
  SHAPE_IMPORT_ACTUAL,
  SHAPE_IMPORT_EXPECTED,
  SHAPE_IMPORT_FIX,
} from './executor-import-boundary.config.js'

export type MessageIds = 'adapterValueImport' | 'shapeImport' | 'executorImport'

export const isAdapterValueImport = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  if (node.specifiers.length === 0) return true
  return !node.specifiers.every((specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type')
}

export const targetsInternalModule = (source: string, filename: string): boolean => {
  if (!source.startsWith('.')) return source.split('/').includes('internal')
  const segments = filename.split('/').slice(0, -1)
  for (const step of source.split('/')) {
    if (step === '.' || step === '') continue
    if (step === '..') {
      segments.pop()
      continue
    }
    segments.push(step)
  }
  return segments.slice(0, -1).includes('internal')
}

export const executorImportBoundary = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        const cell = cellOf(source)

        if (cell === 'adapter') {
          if (!isAdapterValueImport(node)) return
          context.report({
            node,
            messageId: 'adapterValueImport',
            data: {
              name: source,
              expected: ADAPTER_VALUE_IMPORT_EXPECTED,
              actual: ADAPTER_VALUE_IMPORT_ACTUAL,
              fix: ADAPTER_VALUE_IMPORT_FIX,
            },
          })
          return
        }

        if (cell === 'shape') {
          context.report({
            node,
            messageId: 'shapeImport',
            data: {
              name: source,
              expected: SHAPE_IMPORT_EXPECTED,
              actual: SHAPE_IMPORT_ACTUAL,
              fix: SHAPE_IMPORT_FIX,
            },
          })
          return
        }

        if (cell === 'executor' && !targetsInternalModule(source, context.filename)) {
          context.report({
            node,
            messageId: 'executorImport',
            data: {
              name: source,
              expected: EXECUTOR_IMPORT_EXPECTED,
              actual: EXECUTOR_IMPORT_ACTUAL,
              fix: EXECUTOR_IMPORT_FIX,
            },
          })
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const sourceNode = node.source
        if (sourceNode.type !== 'Literal') return
        if (typeof sourceNode.value !== 'string') return
        const cell = cellOf(sourceNode.value)
        if (cell === 'adapter') {
          context.report({
            node,
            messageId: 'adapterValueImport',
            data: {
              name: sourceNode.value,
              expected: ADAPTER_VALUE_IMPORT_EXPECTED,
              actual: ADAPTER_VALUE_IMPORT_ACTUAL,
              fix: ADAPTER_VALUE_IMPORT_FIX,
            },
          })
          return
        }
        if (cell === 'shape') {
          context.report({
            node,
            messageId: 'shapeImport',
            data: {
              name: sourceNode.value,
              expected: SHAPE_IMPORT_EXPECTED,
              actual: SHAPE_IMPORT_ACTUAL,
              fix: SHAPE_IMPORT_FIX,
            },
          })
          return
        }
        if (cell === 'executor' && !targetsInternalModule(sourceNode.value, context.filename)) {
          context.report({
            node,
            messageId: 'executorImport',
            data: {
              name: sourceNode.value,
              expected: EXECUTOR_IMPORT_EXPECTED,
              actual: EXECUTOR_IMPORT_ACTUAL,
              fix: EXECUTOR_IMPORT_FIX,
            },
          })
        }
      },
    }
  },
})
