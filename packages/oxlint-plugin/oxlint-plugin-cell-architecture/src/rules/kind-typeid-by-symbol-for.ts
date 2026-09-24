import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { kindOfFile } from './kind-file.js'
import {
  extraSymbolActualOf,
  meta,
  MISSING_TYPEID_ACTUAL,
  NOT_SYMBOL_CALL_ACTUAL,
  SLOT_FIX,
  STRING_TYPEID_ACTUAL_OF,
  TYPEID_EXPECTED,
  TYPEID_FIX,
  UNEXPORTED_TYPEID_ACTUAL,
} from './kind-typeid-by-symbol-for.config.js'
import { exportSpecifierNamesOf, isSymbolCall, type ModuleDeclaration, moduleDeclarationsOf } from './module-scope.js'

export type MessageIds = 'notSymbolFor' | 'extraSymbol'

const isTypeIdName = (name: string | null): name is 'TypeId' => name === 'TypeId'

const literalArgumentOf = (call: ESTree.Node): string | null => {
  if (call.type !== 'CallExpression') return null
  const argument = call.arguments[0]
  if (argument === undefined || argument.type !== 'Literal') return null
  return typeof argument.value === 'string' ? argument.value : null
}

const reportExtra = (context: Context, node: ESTree.Node): void => {
  context.report({
    node,
    messageId: 'extraSymbol',
    data: {
      name: 'a hand-rolled symbol declaration',
      expected: TYPEID_EXPECTED,
      actual: extraSymbolActualOf(context.sourceCode.getText(node)),
      fix: SLOT_FIX,
    },
  })
}

const reportTypeId = (context: Context, node: ESTree.Node, actual: string): void => {
  context.report({
    node,
    messageId: 'notSymbolFor',
    data: { name: 'TypeId', expected: TYPEID_EXPECTED, actual, fix: TYPEID_FIX },
  })
}

export const kindTypeIdBySymbolFor = defineRule({
  meta,
  create(context: Context) {
    const kind = kindOfFile(context.filename)
    if (kind === null) return {}
    const program = context.sourceCode.ast
    const specifierNames = exportSpecifierNamesOf(program)
    const exportedTypeIds: ModuleDeclaration[] = []
    const sanctionedCalls = new Set<ESTree.Node>()
    for (const declaration of moduleDeclarationsOf(program)) {
      if (isTypeIdName(declaration.name) === false) continue
      if (declaration.exported === false && specifierNames.has('TypeId') === false) continue
      exportedTypeIds.push(declaration)
      const init = declaration.declarator.init
      if (init !== null && literalArgumentOf(init) !== null && isSymbolCall(init)) {
        sanctionedCalls.add(init)
      }
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (isSymbolCall(node) === false || sanctionedCalls.has(node)) return
        reportExtra(context, node)
      },
      'Program:exit'(node: ESTree.Program) {
        if (exportedTypeIds.length === 0) {
          let declared = false
          for (const declaration of moduleDeclarationsOf(node)) {
            if (isTypeIdName(declaration.name) === false) continue
            declared = true
            reportTypeId(context, declaration.declarator, UNEXPORTED_TYPEID_ACTUAL)
          }
          if (declared === false) reportTypeId(context, node, MISSING_TYPEID_ACTUAL)
          return
        }
        for (const declaration of exportedTypeIds) {
          const init = declaration.declarator.init
          if (init !== null && sanctionedCalls.has(init)) continue
          if (init !== null && init.type === 'Literal' && typeof init.value === 'string') {
            reportTypeId(context, declaration.declarator, STRING_TYPEID_ACTUAL_OF('TypeId', init.value))
            continue
          }
          reportTypeId(context, declaration.declarator, NOT_SYMBOL_CALL_ACTUAL)
        }
      },
    }
  },
})
