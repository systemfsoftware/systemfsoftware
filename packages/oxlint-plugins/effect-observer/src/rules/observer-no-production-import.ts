import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  OBSERVER_MODULE_SOURCE,
  Options,
  PRODUCTION_IMPORT_ACTUAL,
  PRODUCTION_IMPORT_EXPECTED,
  PRODUCTION_IMPORT_FIX,
  TEST_FILE_SOURCE,
  TEST_PATH_SOURCE,
  TOOLING_PATH_SOURCE,
} from './observer-no-production-import.config.js'

export type MessageIds = 'productionObserverImport'

const isPermittedCaller = (filename: string): boolean =>
  OBSERVER_MODULE_SOURCE.test(filename) ||
  TEST_FILE_SOURCE.test(filename) ||
  TEST_PATH_SOURCE.test(filename) ||
  TOOLING_PATH_SOURCE.test(filename)

export const observerNoProductionImport = defineRule({
  meta,
  create(context: Context) {
    if (isPermittedCaller(context.filename)) return {}

    const reportProductionImport = (node: ESTree.Node, source: string): void => {
      context.report({
        node,
        messageId: 'productionObserverImport',
        data: {
          name: source,
          expected: PRODUCTION_IMPORT_EXPECTED,
          actual: PRODUCTION_IMPORT_ACTUAL,
          fix: PRODUCTION_IMPORT_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (OBSERVER_MODULE_SOURCE.test(source)) reportProductionImport(node, source)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        const source = node.source.value
        if (OBSERVER_MODULE_SOURCE.test(source)) reportProductionImport(node, source)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = node.source.value
        if (OBSERVER_MODULE_SOURCE.test(source)) reportProductionImport(node, source)
      },
    }
  },
})
