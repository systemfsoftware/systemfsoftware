import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import { NON_PRODUCTION_CALLER } from '../cell-import-table.config.js'
import { cellOf, hasValueBinding } from './cell-import-boundary.js'
import { meta, OptionsElement, TEST_RUNTIME_EXPECTED, TEST_RUNTIME_FIX } from './no-test-runtime-in-pure-cell.config.js'

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'forbiddenTestRuntime'

const isImportMetaVitestReference = (node: ESTree.MemberExpression): boolean => {
  if (node.computed) return false
  const { object, property } = node
  if (property.type !== 'Identifier' || property.name !== 'vitest') return false
  if (object.type !== 'MetaProperty') return false
  return object.meta.name === 'import' && object.property.name === 'meta'
}

const isInsideImportMetaVitestGuard = (
  node: ESTree.ImportExpression,
  guards: readonly ESTree.MemberExpression[],
): boolean => {
  let child: ESTree.Node | null = node
  let current: ESTree.Node | null = node.parent
  while (current !== null && current.type !== 'Program') {
    if (current.type === 'IfStatement') {
      const test = current.test
      const guardInTest = guards.some(
        (guard) => guard.start >= test.start && guard.end <= test.end,
      )
      if (guardInTest && child === current.consequent) return true
    }
    child = current
    current = current.parent
  }
  return false
}

const isTypeOnlyExport = (node: ESTree.ExportNamedDeclaration): boolean =>
  node.exportKind === 'type' ||
  (node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.exportKind === 'type'))

export const noTestRuntimeInPureCell = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const cell = cellOf(filename)
    if (cell === null) return {}

    if (NON_PRODUCTION_CALLER.some((pattern) => pattern.test(filename))) return {}

    const options = S.decodeUnknownSync(OptionsElement)(context.options[0] ?? {})
    if (!options.pureCells.includes(cell.slice(1))) return {}

    const guards: ESTree.MemberExpression[] = []

    const isBannedSpecifier = (specifier: string): boolean =>
      options.testRuntimes.some(
        (runtime) => specifier === runtime || specifier.startsWith(`${runtime}/`),
      )

    const inspect = (node: ESTree.Node, specifier: string, runtimeBinding: boolean): void => {
      if (!runtimeBinding) return
      if (!isBannedSpecifier(specifier)) return
      if (node.type === 'ImportExpression' && isInsideImportMetaVitestGuard(node, guards)) return
      context.report({
        node,
        messageId: 'forbiddenTestRuntime',
        data: {
          name: specifier,
          cell,
          expected: TEST_RUNTIME_EXPECTED,
          actual: `a runtime import of the test runtime ${specifier}`,
          fix: TEST_RUNTIME_FIX,
        },
      })
    }

    return {
      MemberExpression(node: ESTree.MemberExpression) {
        if (isImportMetaVitestReference(node)) guards.push(node)
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        inspect(node, node.source.value, hasValueBinding(node))
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        inspect(node, node.source.value, !isTypeOnlyExport(node))
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        inspect(node, node.source.value, node.exportKind !== 'type')
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal') return
        const value = node.source.value
        if (typeof value !== 'string') return
        inspect(node, value, true)
      },
    }
  },
})
