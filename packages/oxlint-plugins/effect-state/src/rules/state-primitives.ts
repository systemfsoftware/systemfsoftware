import type { ESTree } from '@oxlint/plugins'
import {
  DEFAULT_EXPORT_PRIMITIVE_NAME,
  PRIMITIVE_CLASS_SUPERS,
  PRIMITIVE_CONSTRUCTORS,
  PRIMITIVE_MAKERS,
} from './state-primitives.config.js'

export type ModuleScopePrimitive = {
  name: string
  kind: string
  node: ESTree.Node
}

export const statePrimitiveKind = (node: ESTree.Node): string | null => {
  if (node.type === 'NewExpression') {
    const callee = node.callee
    if (callee.type !== 'Identifier') return null
    return PRIMITIVE_CONSTRUCTORS[callee.name] === true ? callee.name : null
  }
  if (node.type !== 'CallExpression') return null
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier' || property.type !== 'Identifier') return null
  const maker = PRIMITIVE_MAKERS.find(
    ([makerObject, makerProperty]) => makerObject === object.name && makerProperty === property.name,
  )
  return maker === undefined ? null : `${maker[0]}.${maker[1]}`
}

/**
 * `Context.Reference<X>()('id', { defaultValue })` nests calls: the outer CallExpression's
 * callee is itself a CallExpression whose callee is the `Context.Reference` member. Unwrap
 * the chain to its innermost callee before matching.
 */
export const classSuperPrimitiveKind = (node: ESTree.Node | null | undefined): string | null => {
  let current: ESTree.Node | null | undefined = node
  while (current !== null && current !== undefined && current.type === 'CallExpression') {
    current = current.callee
  }
  if (current === null || current === undefined || current.type !== 'MemberExpression') return null
  const object = current.object
  const property = current.property
  if (object.type !== 'Identifier' || property.type !== 'Identifier') return null
  const owner = PRIMITIVE_CLASS_SUPERS.find(
    ([superObject, superProperty]) => superObject === object.name && superProperty === property.name,
  )
  return owner === undefined ? null : `${owner[0]}.${owner[1]}`
}

type ClassDeclarationNode = ESTree.Class

const classDeclarationsOf = (program: ESTree.Program): ClassDeclarationNode[] => {
  const out: ClassDeclarationNode[] = []
  for (const statement of program.body) {
    if (statement.type === 'ClassDeclaration') {
      out.push(statement)
      continue
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'ClassDeclaration') {
      out.push(statement.declaration)
    }
  }
  return out
}

const variableDeclarationsOf = (program: ESTree.Program): ESTree.VariableDeclaration[] => {
  const out: ESTree.VariableDeclaration[] = []
  for (const statement of program.body) {
    if (statement.type === 'VariableDeclaration') {
      out.push(statement)
      continue
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
      out.push(statement.declaration)
    }
  }
  return out
}

export const moduleScopeStatePrimitives = (program: ESTree.Program): ModuleScopePrimitive[] => {
  const found: ModuleScopePrimitive[] = []
  for (const declaration of variableDeclarationsOf(program)) {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier') continue
      const init = declarator.init
      if (init === null) continue
      const kind = statePrimitiveKind(init)
      if (kind === null) continue
      found.push({ name: declarator.id.name, kind, node: declarator })
    }
  }
  for (const declaration of classDeclarationsOf(program)) {
    if (declaration.id === null || declaration.id === undefined) continue
    const kind = classSuperPrimitiveKind(declaration.superClass)
    if (kind === null) continue
    found.push({ name: declaration.id.name, kind, node: declaration })
  }
  for (const statement of program.body) {
    if (statement.type !== 'ExportDefaultDeclaration') continue
    const kind = statePrimitiveKind(statement.declaration)
    if (kind !== null) found.push({ name: DEFAULT_EXPORT_PRIMITIVE_NAME, kind, node: statement })
  }
  return found
}
