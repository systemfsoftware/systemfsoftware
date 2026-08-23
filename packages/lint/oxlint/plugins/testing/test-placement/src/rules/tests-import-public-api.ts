import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import { meta, REACH_IN_ACTUAL, REACH_IN_EXPECTED, REACH_IN_FIX } from './tests-import-public-api.config.js'

export const isForbiddenRelativeSpecifier = (value: string): boolean => {
  if (!value.startsWith('.')) return false
  let sawDotDot = false
  for (const segment of value.split('/')) {
    if (segment === '..') sawDotDot = true
    if (segment === 'src') return true
    if (sawDotDot && segment === 'internal') return true
  }
  return false
}

const specifierOf = (node: ESTree.Node): string | undefined => {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  return undefined
}

export const testsImportPublicApi = defineRule({
  meta,
  create(context: Context) {
    if (isUnderSrc(context.filename)) return {}
    if (!isTestFile(basenameOf(context.filename))) return {}

    const reportIfForbidden = (sourceNode: ESTree.Node): void => {
      const value = specifierOf(sourceNode)
      if (value === undefined || !isForbiddenRelativeSpecifier(value)) return
      context.report({
        node: sourceNode,
        messageId: 'sourceReachIn',
        data: {
          name: value,
          expected: REACH_IN_EXPECTED,
          actual: REACH_IN_ACTUAL,
          fix: REACH_IN_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportIfForbidden(node.source)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source !== null) reportIfForbidden(node.source)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportIfForbidden(node.source)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        reportIfForbidden(node.source)
      },
      TSImportEqualsDeclaration(node: ESTree.Node) {
        if (!('moduleReference' in node)) return
        const reference = node.moduleReference
        if (
          reference !== null &&
          typeof reference === 'object' &&
          'type' in reference &&
          reference.type === 'TSExternalModuleReference' &&
          'expression' in reference
        ) {
          const expression = reference.expression
          if (expression !== null && typeof expression === 'object' && 'type' in expression) {
            reportIfForbidden(expression)
          }
        }
      },
    }
  },
})
