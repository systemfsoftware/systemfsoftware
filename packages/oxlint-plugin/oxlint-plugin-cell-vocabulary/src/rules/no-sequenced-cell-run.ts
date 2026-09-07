import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DESCRIPTION_NAMESPACE,
  GEN_MEMBER,
  meta,
  MODULE_SOURCE,
  RUN_MEMBER,
  SEQUENCED_CELL_RUN_ACTUAL,
  SEQUENCED_CELL_RUN_EXPECTED,
  SEQUENCED_CELL_RUN_FIX,
  SEQUENCED_CELL_RUN_NAME,
  SKIPPED_WALK_KEYS,
} from './no-sequenced-cell-run.config.js'

export type MessageIds = 'sequencedCellRun'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeTypeOf = (node: Walkable): string => String(node['type'])

const isCallNode = (node: unknown): node is Walkable & ESTree.CallExpression =>
  isWalkable(node) && nodeTypeOf(node) === 'CallExpression'

const isYieldNode = (node: Walkable): node is Walkable & ESTree.YieldExpression =>
  nodeTypeOf(node) === 'YieldExpression'

const isFunctionNode = (node: Walkable): boolean => {
  const type = nodeTypeOf(node)
  return type === 'FunctionExpression' || type === 'ArrowFunctionExpression' || type === 'FunctionDeclaration'
}

const walkGenBody = (value: unknown, visit: (node: Walkable) => void, isRoot: boolean): void => {
  if (!isWalkable(value)) return
  if (!isRoot && isFunctionNode(value)) return
  visit(value)
  for (const key of Object.keys(value)) {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
    walkGenBody(value[key], visit, false)
  }
}

const mentionsBinding = (value: unknown, name: string): boolean => {
  if (!isWalkable(value)) return false
  if (nodeTypeOf(value) === 'Identifier' && String(value['name']) === name) return true
  if (isFunctionNode(value)) return false
  return Object.keys(value).some((key) => {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) return false
    return mentionsBinding(value[key], name)
  })
}

export const noSequencedCellRun = defineRule({
  meta,
  create(context: Context) {
    const cellNames = new Set<string>()
    const cellNamespaces = new Set<string>()
    const effectNames = new Set<string>()

    const isCellRunCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
      if (callee.property.name !== RUN_MEMBER) return false
      const object = callee.object
      if (object.type === 'Identifier') return cellNames.has(object.name)
      if (
        object.type === 'MemberExpression' &&
        object.property.type === 'Identifier' &&
        object.property.name === DESCRIPTION_NAMESPACE &&
        object.object.type === 'Identifier'
      ) {
        return cellNamespaces.has(object.object.name)
      }
      return false
    }

    const isGenCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
      if (callee.property.name !== GEN_MEMBER) return false
      return callee.object.type === 'Identifier' && effectNames.has(callee.object.name)
    }

    const checkGenBody = (body: ESTree.Node): void => {
      const runs: { readonly node: ESTree.CallExpression; readonly binding: string | null }[] = []
      walkGenBody(body, (found) => {
        if (!isYieldNode(found) || !isCallNode(found.argument)) return
        const call = found.argument
        if (!isCellRunCall(call)) return
        const parent: unknown = found.parent
        let binding: string | null = null
        if (
          isWalkable(parent) &&
          nodeTypeOf(parent) === 'VariableDeclarator' &&
          isWalkable(parent['id']) &&
          nodeTypeOf(parent['id']) === 'Identifier'
        ) {
          binding = String(parent['id']['name'])
        }
        runs.push({ node: call, binding })
      }, true)
      const available: string[] = []
      for (const run of runs) {
        const fed = available.filter((name) => run.node.arguments.some((argument) => mentionsBinding(argument, name)))
        if (fed.length > 0) {
          context.report({
            node: run.node,
            messageId: 'sequencedCellRun',
            data: {
              name: SEQUENCED_CELL_RUN_NAME,
              expected: SEQUENCED_CELL_RUN_EXPECTED,
              actual: SEQUENCED_CELL_RUN_ACTUAL,
              fix: SEQUENCED_CELL_RUN_FIX,
            },
          })
        }
        if (run.binding !== null) available.push(run.binding)
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
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
            if (source === 'effect/Effect' && specifier.type === 'ImportNamespaceSpecifier') {
              effectNames.add(specifier.local.name)
              continue
            }
            if (
              source === 'effect' &&
              ((specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === 'Effect') ||
                specifier.type === 'ImportNamespaceSpecifier')
            ) {
              effectNames.add(specifier.local.name)
            }
          }
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!isGenCall(node)) return
        const fn = node.arguments[0]
        if (fn === undefined) return
        if (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression') return
        if (fn.body === null || fn.body.type !== 'BlockStatement') return
        checkGenBody(fn.body)
      },
    }
  },
})
