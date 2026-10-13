import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

import {
  EFFECT_ATOM_SOURCE,
  HYDRATE_MEMBER_SEQUENCE,
  meta,
  REACT_EFFECT_EXPECTED,
  REACT_EFFECT_FIX,
  REACT_EFFECT_NAME,
  REACT_MODULE,
  reactEffectCallVerdict,
  reactEffectReexportVerdict,
  reactEffectReferenceVerdict,
} from './no-react-effect.config.js'
import type { ReactEffectVerdict } from './no-react-effect.config.js'

export type MessageIds = 'reactEffect'

type GetScope = (node: ESTree.Node) => unknown

type IdentifierNode = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }

type CallbackNode = ESTree.Function | ESTree.ArrowFunctionExpression

const IMPORT_SPECIFIER_TYPES: Record<string, true> = {
  ImportSpecifier: true,
  ImportDefaultSpecifier: true,
  ImportNamespaceSpecifier: true,
}

const isIdentifierNode = (node: ESTree.Node): node is IdentifierNode => node.type === 'Identifier'

const isCallbackNode = (node: ESTree.Node): node is CallbackNode =>
  node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

const isImportBindingIdentifier = (node: IdentifierNode): boolean => {
  const parent: ESTree.Node | null = node.parent
  return parent !== null && IMPORT_SPECIFIER_TYPES[parent.type] === true
}

interface ReferenceLike {
  readonly identifier: ESTree.Node
  readonly isWriteOnly: () => boolean
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly ReferenceLike[]
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const isReadReference = (node: IdentifierNode, getScope: GetScope): boolean => {
  const scopeValue: unknown = getScope(node)
  if (!isScopeLike(scopeValue)) return false
  for (let scope: ScopeLike | null = scopeValue; scope !== null; scope = scope.upper) {
    const found = scope.references.find((reference) => reference.identifier === node)
    if (found !== undefined) return !found.isWriteOnly()
  }
  return false
}

const isReexportedName = (node: IdentifierNode): boolean => {
  const parent: ESTree.Node | null = node.parent
  if (parent === null || parent.type !== 'ExportSpecifier') return false
  const declaration: ESTree.Node | null = parent.parent
  return declaration !== null && declaration.type === 'ExportNamedDeclaration' && declaration.source !== null
}

const isReactEffectOrigin = (origin: ImportOrigin): boolean =>
  origin.source === REACT_MODULE && origin.importedName === REACT_EFFECT_NAME && origin.path.length === 0

const isHydrateCall = (node: ESTree.Node, getScope: GetScope): boolean => {
  if (node.type !== 'CallExpression') return false
  if (node.arguments.length !== 2) return false
  const origin = resolveImportOrigin(node.callee, getScope)
  if (origin === null) return false
  if (origin.source !== EFFECT_ATOM_SOURCE) return false
  const sequence = originMemberSequence(origin)
  return (
    sequence.length === HYDRATE_MEMBER_SEQUENCE.length &&
    HYDRATE_MEMBER_SEQUENCE.every((segment, index) => sequence[index] === segment)
  )
}

const blockBodyStatementsOf = (callback: CallbackNode): readonly ESTree.Node[] | null => {
  const body = callback.body
  if (body === null) return null
  if (body.type !== 'BlockStatement') return null
  return body.body
}

const isAdmittedEffectCall = (call: ESTree.CallExpression, getScope: GetScope): boolean => {
  if (call.arguments.length !== 2) return false
  const callback = call.arguments[0]
  const dependencies = call.arguments[1]
  if (callback === undefined || dependencies === undefined) return false
  if (!isCallbackNode(callback)) return false
  if (dependencies.type !== 'ArrayExpression') return false
  const statements = blockBodyStatementsOf(callback)
  if (statements === null || statements.length !== 1) return false
  const statement = statements[0]
  if (statement === undefined || statement.type !== 'ExpressionStatement') return false
  return isHydrateCall(statement.expression, getScope)
}

export const noReactEffect = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope

    const report = (verdict: ReactEffectVerdict, node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'reactEffect',
        data: {
          ...verdict,
          expected: REACT_EFFECT_EXPECTED,
          fix: REACT_EFFECT_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        if (node.source.value !== REACT_MODULE) return
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ExportSpecifier') continue
          const local = specifier.local
          if (local.type === 'Identifier' && local.name === REACT_EFFECT_NAME) {
            report(reactEffectReexportVerdict(), specifier)
          }
        }
      },

      Identifier(node: ESTree.Node) {
        if (!isIdentifierNode(node)) return
        if (isImportBindingIdentifier(node)) return
        if (isReexportedName(node)) return
        if (!isReadReference(node, getScope)) return
        const origin = resolveImportOrigin(node, getScope)
        if (origin === null || !isReactEffectOrigin(origin)) return

        const parent: ESTree.Node | null = node.parent
        if (parent !== null && parent.type === 'CallExpression' && parent.callee === node) {
          if (isAdmittedEffectCall(parent, getScope)) return
          report(reactEffectCallVerdict(), node)
          return
        }

        report(reactEffectReferenceVerdict(), node)
      },
    }
  },
})
