import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { FOREIGN_VITEST_SOURCES } from './path.config.js'
import { isRawVitestPackage } from './path.js'
import {
  meta,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
} from './vitest-from-systemfsoftware-vitest.config.js'

export type MessageIds = 'vitestImport'

const isTypeOnly = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return true
  if (node.specifiers.length === 0) return false
  return node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

const isForeignVitestLiteral = (node: ESTree.Expression): boolean =>
  node.type === 'Literal' && typeof node.value === 'string' && FOREIGN_VITEST_SOURCES[node.value] === true

export const vitestFromSystemfsoftwareVitest = defineRule({
  meta,
  create(context: Context) {
    if (isRawVitestPackage(context.filename)) return {}
    const report = (node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'vitestImport',
        data: {
          name: VIOLATION_NAME,
          expected: VIOLATION_EXPECTED,
          actual: VIOLATION_ACTUAL,
          fix: VIOLATION_FIX,
        },
      })
    }
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (FOREIGN_VITEST_SOURCES[node.source.value] !== true) return
        if (isTypeOnly(node)) return
        report(node)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (!isForeignVitestLiteral(node.source)) return
        report(node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        if (FOREIGN_VITEST_SOURCES[node.source.value] !== true) return
        report(node)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null || node.exportKind === 'type') return
        if (FOREIGN_VITEST_SOURCES[node.source.value] !== true) return
        report(node)
      },
    }
  },
})
