import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DOMAIN_CELL_SOURCE,
  DOMAIN_IMPORT_ACTUAL,
  DOMAIN_IMPORT_EXPECTED,
  DOMAIN_IMPORT_FIX,
  meta,
  Options,
} from './observer-no-domain-imports.config.js'

export type MessageIds = 'domainCellImport'

const OBSERVER_SUFFIX = '.observer.ts'

const isObserverFile = (filename: string): boolean => filename.endsWith(OBSERVER_SUFFIX)

export const observerNoDomainImports = defineRule({
  meta,
  create(context: Context) {
    if (!isObserverFile(context.filename)) return {}

    const reportDomainImport = (node: ESTree.Node, source: string): void => {
      context.report({
        node,
        messageId: 'domainCellImport',
        data: {
          name: source,
          expected: DOMAIN_IMPORT_EXPECTED,
          actual: DOMAIN_IMPORT_ACTUAL,
          fix: DOMAIN_IMPORT_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (DOMAIN_CELL_SOURCE.test(source)) reportDomainImport(node, source)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        const source = node.source.value
        if (DOMAIN_CELL_SOURCE.test(source)) reportDomainImport(node, source)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = node.source.value
        if (DOMAIN_CELL_SOURCE.test(source)) reportDomainImport(node, source)
      },
    }
  },
})
