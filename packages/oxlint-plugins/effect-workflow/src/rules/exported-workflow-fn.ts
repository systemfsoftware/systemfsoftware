import type { ESTree } from '@oxlint/plugins'

export const functionVariableDeclaratorName = (decl: ESTree.VariableDeclarator): string | null => {
  if (
    decl.id.type === 'Identifier' &&
    decl.init !== null &&
    (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')
  ) {
    return decl.id.name
  }
  return null
}

export const getExportedWorkflowFunction = (
  node: ESTree.ExportNamedDeclaration,
): ESTree.Node | undefined => {
  const declaration = node.declaration
  if (declaration?.type === 'FunctionDeclaration') return declaration
  if (declaration?.type !== 'VariableDeclaration') return undefined
  return declaration.declarations.find((decl) => functionVariableDeclaratorName(decl) !== null)
}
