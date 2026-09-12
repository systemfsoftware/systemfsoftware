import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  CELL_MODULE,
  CELL_NAME,
  CELL_RUN,
  CELL_RUN_ACTUAL,
  CELL_RUN_EXPECTED,
  CELL_RUN_FIX,
  ENTRYPOINT_FILE,
  meta,
  RUN_NAME,
  TEST_FILE_PATTERN,
} from './cell-run-placement.config.js'

export type MessageIds = 'cellRunOutsideEntrypoint'

const isCellRunCallee = (
  callee: ESTree.CallExpression['callee'],
  cellNames: ReadonlySet<string>,
): boolean => {
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed) return false

  const property = callee.property
  if (property.type !== 'Identifier') return false
  if (property.name !== RUN_NAME) return false

  const object = callee.object
  return object.type === 'Identifier' && cellNames.has(object.name)
}

export const cellRunPlacement = defineRule({
  meta,
  create(context: Context) {
    if (ENTRYPOINT_FILE.test(context.filename)) return {}
    if (TEST_FILE_PATTERN.test(context.filename)) return {}

    const cellNames = new Set<string>()

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.source.value !== CELL_MODULE) return

        for (const spec of node.specifiers) {
          if (spec.type === 'ImportNamespaceSpecifier') {
            cellNames.add(spec.local.name)
          } else if (spec.type === 'ImportSpecifier') {
            const imported = spec.imported
            const exportName = imported.type === 'Literal' ? imported.value : imported.name
            if (exportName === CELL_NAME) cellNames.add(spec.local.name)
          }
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!isCellRunCallee(node.callee, cellNames)) return

        context.report({
          node: node.callee,
          messageId: 'cellRunOutsideEntrypoint',
          data: {
            name: CELL_RUN,
            expected: CELL_RUN_EXPECTED,
            actual: CELL_RUN_ACTUAL,
            fix: CELL_RUN_FIX,
          },
        })
      },
    }
  },
})
