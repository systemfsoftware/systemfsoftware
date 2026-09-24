import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  dynamicActualOf,
  EXPECTED,
  FIX,
  meta,
  reexportActualOf,
  staticActualOf,
} from './handle-imports-no-resource.config.js'
import { isHandleFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'resourceImport'

const RESOURCE_MODULE_SPECIFIER = /\.resource(?:\.(?:js|mjs|cjs|ts))?$/

const specifierOf = (source: ESTree.Node): string | null =>
  source.type === 'Literal' && typeof source.value === 'string' ? source.value : null

const reportResourceImport = (
  context: Context,
  node: ESTree.Node,
  source: ESTree.Node,
  actual: (s: string) => string,
): void => {
  const specifier = specifierOf(source) ?? ''
  context.report({
    node,
    messageId: 'resourceImport',
    data: { name: specifier, expected: EXPECTED, actual: actual(specifier), fix: FIX },
  })
}

const isResourceModule = (source: ESTree.Node): boolean => {
  const specifier = specifierOf(source)
  return specifier !== null && RESOURCE_MODULE_SPECIFIER.test(specifier)
}

export const handleImportsNoResource = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename) || isHandleFile(context.filename) === false) return {}
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isResourceModule(node.source) === false) return
        reportResourceImport(context, node, node.source, staticActualOf)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (isResourceModule(node.source) === false) return
        reportResourceImport(context, node, node.source, reexportActualOf)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null || isResourceModule(node.source) === false) return
        reportResourceImport(context, node, node.source, reexportActualOf)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (isResourceModule(node.source) === false) return
        reportResourceImport(context, node, node.source, dynamicActualOf)
      },
    }
  },
})
