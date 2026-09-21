import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ENTRYPOINT_IMPORT_ACTUAL,
  ENTRYPOINT_IMPORT_EXPECTED,
  ENTRYPOINT_IMPORT_FIX,
  MAIN_MODULE_SOURCE,
  meta,
} from './entrypoint-not-imported.config.js'

export type MessageIds = 'entrypointImport'

export const entrypointNotImported = defineRule({
  meta,
  create(context: Context) {
    const reportSource = (node: ESTree.Node, source: string): void => {
      if (!MAIN_MODULE_SOURCE.test(source)) return
      context.report({
        node,
        messageId: 'entrypointImport',
        data: {
          name: source,
          expected: ENTRYPOINT_IMPORT_EXPECTED,
          actual: ENTRYPOINT_IMPORT_ACTUAL,
          fix: ENTRYPOINT_IMPORT_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportSource(node, node.source.value)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        reportSource(node, node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportSource(node, node.source.value)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal') return
        if (typeof node.source.value !== 'string') return
        reportSource(node, node.source.value)
      },
    }
  },
})
