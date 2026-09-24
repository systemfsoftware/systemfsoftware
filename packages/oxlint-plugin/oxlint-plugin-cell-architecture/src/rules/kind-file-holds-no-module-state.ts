import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'

import { isEffectSource } from './effect-origin.js'
import {
  COLLECTION_ACTUAL_OF,
  COLLECTION_FIX,
  EXPECTED,
  meta,
  REBINDING_ACTUAL,
  REBINDING_FIX,
  REF_ACTUAL,
  REF_FIX,
} from './kind-file-holds-no-module-state.config.js'
import { basenameOf, isHandleFile, isResourceFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'moduleState'

const MUTABLE_COLLECTIONS: Readonly<Record<string, true>> = {
  Map: true,
  Set: true,
  WeakMap: true,
  WeakSet: true,
}

const nameOfBinding = (id: ESTree.Node): string => (id.type === 'Identifier' ? id.name : 'a pattern binding')

const reportState = (
  context: Context,
  node: ESTree.Node,
  name: string,
  actual: string,
  fix: string,
): void => {
  context.report({ node, messageId: 'moduleState', data: { name, expected: EXPECTED, actual, fix } })
}

const collectionNameOf = (init: ESTree.Node): string | null => {
  if (init.type !== 'NewExpression' || init.callee.type !== 'Identifier') return null
  return MUTABLE_COLLECTIONS[init.callee.name] === true ? init.callee.name : null
}

const isRefConstruction = (init: ESTree.Node, getScope: (node: ESTree.Node) => unknown): boolean => {
  if (init.type !== 'CallExpression') return false
  const origin = resolveImportOrigin(init.callee, getScope)
  if (origin === null || isEffectSource(origin.source) === false) return false
  if (origin.source === 'effect/Ref') return true
  return originMemberSequence(origin)[0] === 'Ref'
}

const checkDeclarator = (
  context: Context,
  declarator: ESTree.VariableDeclarator,
  kind: string,
  getScope: (node: ESTree.Node) => unknown,
): void => {
  const name = nameOfBinding(declarator.id)
  const init = declarator.init
  if (kind !== 'const') {
    reportState(context, declarator, name, REBINDING_ACTUAL, REBINDING_FIX)
    return
  }
  if (init === null) return
  const collection = collectionNameOf(init)
  if (collection !== null) {
    reportState(context, declarator, name, COLLECTION_ACTUAL_OF(`new ${collection}()`), COLLECTION_FIX)
    return
  }
  if (isRefConstruction(init, getScope)) {
    reportState(context, declarator, name, REF_ACTUAL, REF_FIX)
  }
}

const variableDeclarationOf = (statement: ESTree.Program['body'][number]): ESTree.VariableDeclaration | null => {
  if (statement.type === 'VariableDeclaration') return statement
  if (statement.type !== 'ExportNamedDeclaration') return null
  return statement.declaration !== null && statement.declaration.type === 'VariableDeclaration'
    ? statement.declaration
    : null
}

export const kindFileHoldsNoModuleState = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename)) return {}
    const basename = basenameOf(context.filename)
    if (isResourceFile(basename) === false && isHandleFile(basename) === false) return {}
    const getScope = context.sourceCode.getScope
    return {
      Program(program: ESTree.Program) {
        for (const statement of program.body) {
          const declaration = variableDeclarationOf(statement)
          if (declaration === null) continue
          for (const declarator of declaration.declarations) {
            checkDeclarator(context, declarator, declaration.kind, getScope)
          }
        }
      },
    }
  },
})
