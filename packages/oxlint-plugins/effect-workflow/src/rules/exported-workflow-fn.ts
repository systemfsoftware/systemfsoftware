import type { ESTree } from '@oxlint/plugins'

// `export const w = Workflow.make((c: Cmd) => …)` is the canonical form that
// `workflow-declaration-form` now requires. The workflow function is the ARGUMENT to
// `make`, not the call, so every rule that inspects parameters has to see through one
// level of call. Matching any non-computed `.make` member call keeps this at depth 0 —
// the file's own syntax tree, no name resolved across a boundary — and pinning *which*
// `make` belongs to the declaration-form rule, which checks the import binding.
const makeCallArgument = (init: ESTree.Node): ESTree.Node | undefined => {
  if (init.type !== 'CallExpression') return undefined
  const callee = init.callee
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'make') return undefined
  const [first] = init.arguments
  if (first === undefined) return undefined
  if (first.type !== 'ArrowFunctionExpression' && first.type !== 'FunctionExpression') return undefined
  return first
}

// The function a declarator ultimately supplies: the initializer when written inline, or
// the decider handed to `make`. Exported because three rules must agree on it — a
// disagreement is what made `workflow-schema-required` silently vacuous (EW1's harm).
export const workflowFunctionInit = (decl: ESTree.VariableDeclarator): ESTree.Node | undefined => {
  const init = decl.init
  if (init === null || init === undefined) return undefined
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return init
  return makeCallArgument(init)
}

export const functionVariableDeclaratorName = (decl: ESTree.VariableDeclarator): string | null => {
  if (decl.id.type === 'Identifier' && workflowFunctionInit(decl) !== undefined) {
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
