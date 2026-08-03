import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DOMAIN_CELL_SOURCE,
  DOMAIN_IMPORT_ACTUAL,
  DOMAIN_IMPORT_EXPECTED,
  DOMAIN_IMPORT_FIX,
  meta,
} from './shape-no-domain-import.config.js'

export type MessageIds = 'domainImport'

const SHAPE_SUFFIX = '.shape.ts'

const isShapeFile = (filename: string): boolean => filename.endsWith(SHAPE_SUFFIX)

export const shapeNoDomainImport = defineRule({
  meta,
  create(context: Context) {
    if (!isShapeFile(context.filename)) return {}

    const reportDomainImport = (node: ESTree.Node, source: string): void => {
      context.report({
        node,
        messageId: 'domainImport',
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
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = node.source.value
        if (DOMAIN_CELL_SOURCE.test(source)) reportDomainImport(node, source)
      },
    }
  },
})
