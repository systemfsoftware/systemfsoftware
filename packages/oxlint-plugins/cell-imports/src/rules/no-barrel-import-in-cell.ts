import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { finalPathStem, MODULE_EXTENSION, NON_PRODUCTION_CALLER } from '../cell-import-table.config.js'
import { cellOf } from './cell-import-boundary.js'
import { BARREL_EXPECTED, BARREL_FIX, BARREL_NAMES, meta } from './no-barrel-import-in-cell.config.js'

export type MessageIds = 'barrelImport'

export const isBarrelSpecifier = (specifier: string): boolean => {
  if (!specifier.startsWith('.')) return false
  const stem = finalPathStem(specifier)
  if (stem === null) return false
  if (BARREL_NAMES.includes(stem)) return true
  // No module extension was present and the stem carries no suffix dot, so the
  // specifier cannot name a leaf file: it resolves to a directory, i.e. a barrel.
  return !MODULE_EXTENSION.test(specifier) && stem.lastIndexOf('.') <= 0
}

export const noBarrelImportInCell = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const cell = cellOf(filename)
    if (cell === null) return {}
    if (NON_PRODUCTION_CALLER.some((pattern) => pattern.test(filename))) return {}

    const inspect = (node: ESTree.Node, specifier: string): void => {
      if (!isBarrelSpecifier(specifier)) return
      context.report({
        node,
        messageId: 'barrelImport',
        data: {
          name: specifier,
          expected: BARREL_EXPECTED,
          actual: `a directory barrel in the ${cell} cell, whose contents the table cannot see`,
          fix: BARREL_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        inspect(node, node.source.value)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        inspect(node, node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        inspect(node, node.source.value)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal') return
        const value = node.source.value
        if (typeof value !== 'string') return
        inspect(node, value)
      },
    }
  },
})
