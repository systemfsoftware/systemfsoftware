import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  calleeRootName,
  collectNamedImportBindings,
  collectNamespaceBindings,
  isCellMemberCall,
  isPipeCall,
  pipeRootOf,
} from './cell.js'
import {
  CONTINUATION_NAMES,
  DESCRIPTION_NAMESPACE,
  EFFECT_NAMESPACE,
  EFFECT_SOURCES,
  meta,
  MODULE_SOURCE,
  PIPE_NAME,
  PIPE_SOURCES,
  RUN_NAME,
  TWO_RUN_CHAIN_ACTUAL,
  TWO_RUN_CHAIN_EXPECTED,
  TWO_RUN_CHAIN_FIX,
} from './no-two-run-chain.config.js'

export type MessageIds = 'twoRunChain'

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionDeclaration' ||
  node.type === 'FunctionExpression'

export const noTwoRunChain = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()
    const effectNamespaces = new Set<string>()
    const pipeNames = new Set<string>()
    const continuationNames = new Set<string>(CONTINUATION_NAMES)

    const scopes: Set<string>[] = []
    const continuationCallbacks = new Set<FunctionNode>()

    const isRunCall = (node: ESTree.Node): boolean =>
      node.type === 'CallExpression' && isCellMemberCall(node, descriptionNamespaces, RUN_NAME)

    const collectPatternIdentifiers = (pattern: ESTree.Node, out: Set<string>): void => {
      switch (pattern.type) {
        case 'Identifier':
          out.add(pattern.name)
          return
        case 'ObjectPattern':
          for (const property of pattern.properties) {
            collectPatternIdentifiers(property.type === 'Property' ? property.value : property.argument, out)
          }
          return
        case 'ArrayPattern':
          for (const element of pattern.elements) {
            if (element !== null) collectPatternIdentifiers(element, out)
          }
          return
        case 'AssignmentPattern':
          collectPatternIdentifiers(pattern.left, out)
          return
        case 'RestElement':
          collectPatternIdentifiers(pattern.argument, out)
          return
        case 'TSParameterProperty':
          collectPatternIdentifiers(pattern.parameter, out)
          return
        default:
          return
      }
    }

    const isCurriedRunStep = (node: ESTree.Node): boolean =>
      node.type === 'CallExpression' && node.arguments.length === 1 && isRunCall(node)

    const runSuccessOf = (node: ESTree.Node): boolean => {
      if (node.type === 'YieldExpression') {
        return node.argument !== null && runSuccessOf(node.argument)
      }
      if (node.type !== 'CallExpression') return false
      if (isRunCall(node)) return true
      if (!isPipeCall(node, pipeNames, PIPE_NAME)) return false
      const last = node.arguments[node.arguments.length - 1]
      return last !== undefined && isCurriedRunStep(last)
    }

    const isContinuationCombinatorCall = (node: ESTree.Node): boolean => {
      if (node.type !== 'CallExpression') return false
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return false
      const object = callee.object
      const property = callee.property
      return object.type === 'Identifier' &&
        effectNamespaces.has(object.name) &&
        property.type === 'Identifier' &&
        continuationNames.has(property.name)
    }

    const inputOf = (call: ESTree.CallExpression): ESTree.Node | null => {
      if (call.arguments.length === 2) return call.arguments[1] ?? null
      if (call.arguments.length === 1) return call.arguments[0] ?? null
      return null
    }

    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      const source = String(node.source.value)
      if (source === MODULE_SOURCE) {
        collectNamespaceBindings(node, DESCRIPTION_NAMESPACE, descriptionNamespaces)
        return
      }
      if (EFFECT_SOURCES.includes(source)) {
        collectNamespaceBindings(node, EFFECT_NAMESPACE, effectNamespaces)
        collectNamedImportBindings(node, PIPE_NAME, pipeNames)
        return
      }
      if (PIPE_SOURCES.includes(source)) {
        collectNamedImportBindings(node, PIPE_NAME, pipeNames)
      }
    }

    const enterFunction = (node: FunctionNode): void => {
      const scope = new Set<string>()
      if (continuationCallbacks.has(node)) {
        for (const param of node.params) collectPatternIdentifiers(param, scope)
      }
      scopes.push(scope)
    }

    const exitFunction = (): void => {
      scopes.pop()
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
      },
      ArrowFunctionExpression: enterFunction,
      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      'FunctionDeclaration:exit': exitFunction,
      'FunctionExpression:exit': exitFunction,
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (descriptionNamespaces.size === 0) return
        const scope = scopes.at(-1)
        if (scope === undefined) return
        if (node.init !== null && runSuccessOf(node.init)) collectPatternIdentifiers(node.id, scope)
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (scopes.length === 0) return
        const scope = scopes.at(-1)
        if (scope !== undefined && node.left.type === 'Identifier') scope.delete(node.left.name)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (descriptionNamespaces.size === 0) return
        if (isRunCall(node)) {
          const scope = scopes.at(-1)
          if (scope !== undefined) {
            const input = inputOf(node)
            const root = input === null ? null : calleeRootName(input)
            if (root !== null && scope.has(root)) {
              context.report({
                node,
                messageId: 'twoRunChain',
                data: {
                  name: RUN_NAME,
                  expected: TWO_RUN_CHAIN_EXPECTED,
                  actual: TWO_RUN_CHAIN_ACTUAL,
                  fix: TWO_RUN_CHAIN_FIX,
                },
              })
            }
          }
          return
        }
        if (isContinuationCombinatorCall(node)) {
          if (node.arguments.length >= 2) {
            const self = node.arguments[0]
            const callback = node.arguments[1]
            if (self !== undefined && callback !== undefined && runSuccessOf(self) && isFunctionNode(callback)) {
              continuationCallbacks.add(callback)
            }
          }
          return
        }
        if (isPipeCall(node, pipeNames, PIPE_NAME)) {
          const root = pipeRootOf(node, pipeNames, PIPE_NAME)
          if (root !== null && isRunCall(root)) {
            for (const step of node.arguments) {
              if (step.type === 'CallExpression' && isContinuationCombinatorCall(step) && step.arguments.length === 1) {
                const callback = step.arguments[0]
                if (callback !== undefined && isFunctionNode(callback)) continuationCallbacks.add(callback)
              }
            }
          }
        }
      },
    }
  },
})
