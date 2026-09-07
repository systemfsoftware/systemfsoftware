import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DESCRIPTION_NAMESPACE,
  LAUNDERED_CELL_SERVICE_ACTUAL,
  LAUNDERED_CELL_SERVICE_EXPECTED,
  LAUNDERED_CELL_SERVICE_FIX,
  LAYER_MEMBER,
  meta,
  MODULE_SOURCE,
  PIPE_FUNCTION,
  PIPE_MEMBER,
  PROVIDE_SERVICE_MEMBER,
  RUN_MEMBER,
  SKIPPED_WALK_KEYS,
} from './no-laundered-cell-service.config.js'

export type MessageIds = 'launderedCellService'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeTypeOf = (node: Walkable): string => String(node['type'])

const parentOf = (value: unknown): unknown => (isWalkable(value) ? value['parent'] : undefined)

const walkSubtree = (value: unknown, visit: (node: Walkable) => void): void => {
  if (!isWalkable(value)) return
  visit(value)
  for (const key of Object.keys(value)) {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
    walkSubtree(value[key], visit)
  }
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly type: string }[] }>
}

type GetScope = (node: ESTree.Node) => unknown

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

const isImportBinding = (name: string, node: ESTree.Node, getScope: GetScope): boolean | null => {
  const scope = getScope(node)
  if (!isScopeLike(scope)) return null
  for (let current: ScopeLike | null = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name)
    if (variable === undefined) continue
    return variable.defs.some((def) => def.type === 'ImportBinding')
  }
  return null
}

const typeNameOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  const type = nodeTypeOf(value)
  if (type === 'Identifier' || type === 'IdentifierReference' || type === 'IdentifierName') {
    return String(value['name'])
  }
  return null
}

const leftmostOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  if (nodeTypeOf(value) === 'TSQualifiedName') return leftmostOf(value['left'])
  return typeNameOf(value)
}

const simpleServiceOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  if (nodeTypeOf(value) !== 'TSTypeReference') return null
  const typeName = value['typeName']
  if (!isWalkable(typeName)) return null
  if (nodeTypeOf(typeName) === 'TSQualifiedName') {
    const right = typeName['right']
    if (isWalkable(right)) return typeNameOf(right)
    return null
  }
  return typeNameOf(typeName)
}

const rootNameOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  const type = nodeTypeOf(value)
  if (type === 'Identifier') return String(value['name'])
  if (type === 'MemberExpression') return rootNameOf(value['object'])
  return null
}

const fullTextOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  const type = nodeTypeOf(value)
  if (type === 'Identifier') return String(value['name'])
  if (type === 'MemberExpression') {
    const property = value['property']
    if (!isWalkable(property) || nodeTypeOf(property) !== 'Identifier') return null
    const head = fullTextOf(value['object'])
    if (head !== null) return `${head}.${String(property['name'])}`
  }
  return null
}

const serviceKeysOf = (value: unknown): string[] => {
  const root = rootNameOf(value)
  if (root === null) return []
  const full = fullTextOf(value)
  return full !== null && full !== root ? [root, full] : [root]
}

export const noLaunderedCellService = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    const cellNames = new Set<string>()
    const cellNamespaces = new Set<string>()
    const effectNames = new Set<string>()
    const pipeNames = new Set<string>()
    const pipeNamespaces = new Set<string>()
    const cellRuns: unknown[] = []
    const cellServices = new Map<string, Set<string>>()

    const isCellCallee = (object: ESTree.Node): boolean => {
      if (object.type === 'Identifier') return cellNames.has(object.name)
      return (
        object.type === 'MemberExpression' &&
        object.property.type === 'Identifier' &&
        object.property.name === DESCRIPTION_NAMESPACE &&
        object.object.type === 'Identifier' &&
        cellNamespaces.has(object.object.name)
      )
    }

    const isCellRunCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
      return callee.property.name === RUN_MEMBER && isCellCallee(callee.object)
    }

    const isCellLayerCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
      return callee.property.name === LAYER_MEMBER && isCellCallee(callee.object)
    }

    const isProvideServiceCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
      if (callee.property.name !== PROVIDE_SERVICE_MEMBER) return false
      return callee.object.type === 'Identifier' && effectNames.has(callee.object.name)
    }

    const candidateServiceOf = (value: unknown, anchor: ESTree.Node): string[] => {
      const root = rootNameOf(value)
      if (root === null) return []
      if (isImportBinding(root, anchor, getScope) === false) return []
      return serviceKeysOf(value)
    }

    const servicesFromAnnotation = (id: unknown): string[] => {
      const found: string[] = []
      walkSubtree(id, (node) => {
        if (nodeTypeOf(node) !== 'TSTypeReference') return
        if (leftmostOf(node['typeName']) === null) return
        const named = cellNames.has(String(leftmostOf(node['typeName']))) ||
          cellNamespaces.has(String(leftmostOf(node['typeName'])))
        if (!named) return
        const args = node['typeArguments']
        const params = node['typeParameters']
        const list: unknown = (isWalkable(args) && Array.isArray(args['params']) ? args['params'] : null) ??
          (isWalkable(params) && Array.isArray(params['params']) ? params['params'] : null)
        if (!Array.isArray(list) || list.length < 4) return
        const fourth: unknown = list[3]
        const simple = simpleServiceOf(fourth)
        if (simple !== null) {
          found.push(simple)
          return
        }
        if (isWalkable(fourth) && nodeTypeOf(fourth) === 'TSUnionType') {
          const members = fourth['types']
          if (Array.isArray(members)) {
            for (const member of members) {
              const memberName = simpleServiceOf(member)
              if (memberName !== null) found.push(memberName)
            }
          }
        }
      })
      return found
    }

    const collectCellDeclaration = (declarator: ESTree.VariableDeclarator): void => {
      const init = declarator.init
      if (declarator.id.type !== 'Identifier' || init === null) return
      if (init.type !== 'CallExpression' || !isCellLayerCall(init)) return
      const name = declarator.id.name
      const services = new Set<string>()
      for (const annotated of servicesFromAnnotation(declarator.id)) services.add(annotated)
      walkSubtree(init, (node) => {
        if (nodeTypeOf(node) !== 'YieldExpression') return
        const argument = node['argument']
        if (!isWalkable(argument)) return
        const argumentType = nodeTypeOf(argument)
        if (argumentType !== 'Identifier' && argumentType !== 'MemberExpression') return
        for (const key of candidateServiceOf(argument, init)) services.add(key)
      })
      cellServices.set(name, services)
    }

    const pipeRootOf = (provide: ESTree.CallExpression): Walkable | null => {
      let child: unknown = provide
      let current: unknown = parentOf(provide)
      while (isWalkable(current) && nodeTypeOf(current) === 'CallExpression') {
        const callee = current['callee']
        if (!isWalkable(callee)) return null
        if (
          nodeTypeOf(callee) === 'MemberExpression' &&
          isWalkable(callee['property']) &&
          nodeTypeOf(callee['property']) === 'Identifier' &&
          String(callee['property']['name']) === PIPE_MEMBER
        ) {
          const args = current['arguments']
          if (!Array.isArray(args) || !args.includes(child)) return null
          const object = callee['object']
          return isWalkable(object) ? object : null
        }
        if (nodeTypeOf(callee) === 'Identifier' && String(callee['name']) === PIPE_FUNCTION) {
          if (!pipeNames.has(String(callee['name']))) return null
          const args = current['arguments']
          if (!Array.isArray(args) || !args.includes(child) || args[0] === child) return null
          const first = args[0]
          return isWalkable(first) ? first : null
        }
        if (
          nodeTypeOf(callee) === 'MemberExpression' &&
          isWalkable(callee['property']) &&
          nodeTypeOf(callee['property']) === 'Identifier' &&
          String(callee['property']['name']) === PIPE_FUNCTION &&
          isWalkable(callee['object']) &&
          nodeTypeOf(callee['object']) === 'Identifier' &&
          pipeNamespaces.has(String(callee['object']['name']))
        ) {
          const args = current['arguments']
          if (!Array.isArray(args) || !args.includes(child) || args[0] === child) return null
          const first = args[0]
          return isWalkable(first) ? first : null
        }
        child = current
        current = parentOf(current)
      }
      return null
    }

    const cellRunIn = (root: Walkable): Walkable | null => {
      let found: Walkable | null = null
      walkSubtree(root, (node) => {
        if (found !== null || nodeTypeOf(node) !== 'CallExpression') return
        for (const recorded of cellRuns) {
          if (node === recorded && isWalkable(recorded)) {
            found = recorded
            return
          }
        }
      })
      return found
    }

    const insideClosure = (value: ESTree.Node): boolean => {
      let current: unknown = parentOf(value)
      while (isWalkable(current)) {
        const type = nodeTypeOf(current)
        if (type === 'Program') return false
        if (
          type === 'FunctionExpression' ||
          type === 'ArrowFunctionExpression' ||
          type === 'FunctionDeclaration'
        ) {
          return true
        }
        current = parentOf(current)
      }
      return false
    }

    const checkProvide = (node: ESTree.CallExpression): void => {
      const tag = node.arguments[0]
      if (tag === undefined || (tag.type !== 'Identifier' && tag.type !== 'MemberExpression')) return
      const root = pipeRootOf(node)
      if (root === null) return
      const run = cellRunIn(root)
      if (run === null) return
      const runArguments = run['arguments']
      if (!Array.isArray(runArguments)) return
      const cellArgument = runArguments[0]
      if (!isWalkable(cellArgument) || nodeTypeOf(cellArgument) !== 'Identifier') return
      const services = cellServices.get(String(cellArgument['name']))
      if (services === undefined) return
      const keys = serviceKeysOf(tag)
      if (!keys.some((key) => services.has(key)) || !insideClosure(node)) return
      context.report({
        node,
        messageId: 'launderedCellService',
        data: {
          name: fullTextOf(tag) ?? keys[0] ?? PROVIDE_SERVICE_MEMBER,
          expected: LAUNDERED_CELL_SERVICE_EXPECTED,
          actual: LAUNDERED_CELL_SERVICE_ACTUAL,
          fix: LAUNDERED_CELL_SERVICE_FIX,
        },
      })
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') {
            if (statement.type === 'VariableDeclaration') {
              for (const declarator of statement.declarations) collectCellDeclaration(declarator)
            } else if (
              statement.type === 'ExportNamedDeclaration' &&
              statement.declaration !== null &&
              statement.declaration.type === 'VariableDeclaration'
            ) {
              for (const declarator of statement.declaration.declarations) {
                collectCellDeclaration(declarator)
              }
            }
            continue
          }
          const source = statement.source.value
          for (const specifier of statement.specifiers) {
            if (source === MODULE_SOURCE) {
              if (specifier.type === 'ImportNamespaceSpecifier') {
                cellNamespaces.add(specifier.local.name)
              } else if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === DESCRIPTION_NAMESPACE &&
                specifier.local.name === DESCRIPTION_NAMESPACE
              ) {
                cellNames.add(specifier.local.name)
              }
              continue
            }
            if (
              source === 'effect/Effect' &&
              specifier.type === 'ImportNamespaceSpecifier' &&
              specifier.local.name === 'Effect'
            ) {
              effectNames.add(specifier.local.name)
              continue
            }
            if (source === 'effect') {
              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === 'Effect' &&
                specifier.local.name === 'Effect'
              ) {
                effectNames.add(specifier.local.name)
              } else if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === PIPE_FUNCTION &&
                specifier.local.name === PIPE_FUNCTION
              ) {
                pipeNames.add(specifier.local.name)
              } else if (
                specifier.type === 'ImportNamespaceSpecifier' &&
                specifier.local.name === 'Effect'
              ) {
                effectNames.add(specifier.local.name)
              }
              continue
            }
            if (
              source === 'effect/Function' &&
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === PIPE_FUNCTION &&
              specifier.local.name === PIPE_FUNCTION
            ) {
              pipeNames.add(specifier.local.name)
              continue
            }
            if (source === 'effect/Function' && specifier.type === 'ImportNamespaceSpecifier') {
              pipeNamespaces.add(specifier.local.name)
            }
          }
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isCellRunCall(node)) cellRuns.push(node)
        if (isProvideServiceCall(node)) checkProvide(node)
      },
    }
  },
})
