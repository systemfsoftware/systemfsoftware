import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'

const { types } = babel

export const stringLiteralMutator: Mutator = function*(node, context: MutatorContext) {
  if (types.isTemplateLiteral(node)) {
    const firstQuasi = node.quasis[0]
    if (firstQuasi === undefined) {
      return
    }
    const replacement = node.quasis.length === 1 && firstQuasi.value.raw.length === 0 ? 'Stryker was here!' : ''
    yield types.templateLiteral([types.templateElement({ raw: replacement })], [])
  }
  if (types.isStringLiteral(node) && isValidParent(node, context)) {
    yield types.stringLiteral(node.value.length === 0 ? 'Stryker was here!' : '')
  }
}

function isValidParent(child: babel.types.StringLiteral, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return true
  }
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

function isObjectOrClassPropertyKey(parent: babel.types.Node, child: babel.types.StringLiteral): boolean {
  return (types.isObjectProperty(parent) && parent.key === child) ||
    (types.isClassProperty(parent) && parent.key === child)
}

function isDisallowedCallExpression(parent: babel.types.Node): boolean {
  return isRequireCall(parent) || isSymbolCall(parent) || isImportCall(parent)
}

function isRequireCall(parent: babel.types.Node): boolean {
  return types.isCallExpression(parent) && types.isIdentifier(parent.callee, { name: 'require' })
}

function isSymbolCall(parent: babel.types.Node): boolean {
  return types.isCallExpression(parent) && types.isIdentifier(parent.callee, { name: 'Symbol' })
}

function isImportCall(parent: babel.types.Node): boolean {
  return types.isCallExpression(parent) && types.isImport(parent.callee)
}
