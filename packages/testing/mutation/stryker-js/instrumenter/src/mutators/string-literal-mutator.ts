import babel, { type NodePath } from '@babel/core'

import { type NodeMutator } from './node-mutator.js'

const { types } = babel

export const stringLiteralMutator: NodeMutator = {
  name: 'StringLiteral',

  *mutate(path) {
    if (path.isTemplateLiteral()) {
      const firstQuasi = path.node.quasis[0]
      if (firstQuasi === undefined) {
        throw new Error('Template literal without quasis')
      }
      const replacement = path.node.quasis.length === 1 && firstQuasi.value.raw.length === 0
        ? 'Stryker was here!'
        : ''
      yield types.templateLiteral(
        [types.templateElement({ raw: replacement })],
        [],
      )
    }
    if (path.isStringLiteral() && isValidParent(path)) {
      yield types.stringLiteral(
        path.node.value.length === 0 ? 'Stryker was here!' : '',
      )
    }
  },
}

function isValidParent(child: NodePath<babel.types.StringLiteral>): boolean {
  const { parent } = child
  return (
    !isImportExportRelated(parent) &&
    !isJsxOrExpressionRelated(parent) &&
    !isObjectOrClassPropertyKey(parent, child) &&
    !isDisallowedCallExpression(parent)
  )
}

function isImportExportRelated(parent: babel.types.Node): boolean {
  return (
    types.isImportDeclaration(parent) ||
    types.isExportDeclaration(parent) ||
    types.isImportOrExportDeclaration(parent) ||
    types.isTSExternalModuleReference(parent)
  )
}

function isJsxOrExpressionRelated(parent: babel.types.Node): boolean {
  return (
    types.isJSXAttribute(parent) ||
    types.isExpressionStatement(parent) ||
    types.isTSLiteralType(parent) ||
    types.isObjectMethod(parent)
  )
}

function isObjectOrClassPropertyKey(
  parent: babel.types.Node,
  child: NodePath<babel.types.StringLiteral>,
): boolean {
  return (
    (types.isObjectProperty(parent) && parent.key === child.node) ||
    (types.isClassProperty(parent) && parent.key === child.node)
  )
}

function isDisallowedCallExpression(parent: babel.types.Node): boolean {
  return (
    isRequireCall(parent) || isSymbolCall(parent) || isImportCall(parent)
  )
}

function isRequireCall(parent: babel.types.Node): boolean {
  return (
    types.isCallExpression(parent) &&
    types.isIdentifier(parent.callee, { name: 'require' })
  )
}

function isSymbolCall(parent: babel.types.Node): boolean {
  return (
    types.isCallExpression(parent) &&
    types.isIdentifier(parent.callee, { name: 'Symbol' })
  )
}

function isImportCall(parent: babel.types.Node): boolean {
  return types.isCallExpression(parent) && types.isImport(parent.callee)
}
