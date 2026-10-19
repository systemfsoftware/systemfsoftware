import type { ESTree } from '@oxlint/plugins'

import { staticNameOf } from './module-origin.js'

export const isSymbolCall = (node: ESTree.Node): boolean => {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type === 'Identifier') return callee.name === 'Symbol'
  return callee.type === 'MemberExpression' && staticNameOf(callee.object) === 'Symbol' &&
    staticNameOf(callee.property) === 'for'
}

export const symbolBindingNamesOf = (program: ESTree.Program): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const declaration of moduleDeclarationsOf(program)) {
    const init = declaration.declarator.init
    if (declaration.name === null || init === null || !isSymbolCall(init)) continue
    names.add(declaration.name)
  }
  return names
}

export interface ModuleDeclaration {
  readonly name: string | null
  readonly declarator: ESTree.VariableDeclarator
  readonly kind: ESTree.VariableDeclaration['kind']
  readonly exported: boolean
}

const push = (
  into: ModuleDeclaration[],
  declaration: ESTree.VariableDeclaration,
  exported: boolean,
): void => {
  for (const declarator of declaration.declarations) {
    into.push({ name: staticNameOf(declarator.id), declarator, kind: declaration.kind, exported })
  }
}

export const moduleDeclarationsOf = (program: ESTree.Program): readonly ModuleDeclaration[] => {
  const declarations: ModuleDeclaration[] = []
  for (const statement of program.body) {
    if (statement.type === 'VariableDeclaration') {
      push(declarations, statement, false)
      continue
    }
    if (statement.type !== 'ExportNamedDeclaration') continue
    const declaration = statement.declaration
    if (declaration !== null && declaration.type === 'VariableDeclaration') {
      push(declarations, declaration, true)
    }
  }
  return declarations
}

export const exportSpecifierNamesOf = (program: ESTree.Program): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const statement of program.body) {
    if (statement.type !== 'ExportNamedDeclaration') continue
    for (const specifier of statement.specifiers) {
      const local = staticNameOf(specifier.local)
      if (local !== null) names.add(local)
    }
  }
  return names
}

export const defaultExportNameOf = (program: ESTree.Program): string | null => {
  for (const statement of program.body) {
    if (statement.type !== 'ExportDefaultDeclaration') continue
    const declaration = statement.declaration
    if (declaration.type === 'Identifier') return declaration.name
  }
  return null
}

const isNode = (value: unknown): value is ESTree.Node => typeof value === 'object' && value !== null && 'type' in value

export const walk = (value: unknown, visit: (node: ESTree.Node) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (!isNode(value)) return
  visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    walk(child, visit)
  }
}

const NESTED_SCOPES: Readonly<Record<string, true>> = {
  ArrowFunctionExpression: true,
  FunctionExpression: true,
  FunctionDeclaration: true,
  ClassDeclaration: true,
  ClassExpression: true,
}

export const returnedValuesOf = (
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
): readonly ESTree.Node[] => {
  const body = fn.body
  if (body === null) return []
  if (body.type !== 'BlockStatement') return [body]
  const returned: ESTree.Node[] = []
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item)
      return
    }
    if (!isNode(value) || NESTED_SCOPES[value.type] === true) return
    if (value.type === 'ReturnStatement') {
      if (value.argument !== null) returned.push(value.argument)
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'parent') collect(child)
    }
  }
  collect(body.body)
  return returned
}
