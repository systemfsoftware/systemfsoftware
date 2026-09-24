import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isRawVitestPackage } from './path.js'
import {
  meta,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
  VITEST_SOURCE,
} from './vitest-from-effect-vitest.config.js'

export type MessageIds = 'vitestImport'

const isTypeOnly = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return true
  if (node.specifiers.length === 0) return false
  return node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

const isVitestLiteral = (node: ESTree.Expression): boolean =>
  node.type === 'Literal' && typeof node.value === 'string' && node.value === VITEST_SOURCE

export const vitestFromEffectVitest = defineRule({
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
        if (node.source.value !== VITEST_SOURCE) return
        if (isTypeOnly(node)) return
        report(node)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (!isVitestLiteral(node.source)) return
        report(node)
      },
    }
  },
})
