import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isCellMemberCall, isPipeCall, pipeRootOf } from './cell.js'
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

    const rootIdentifierOf = (node: ESTree.Node): string | null => {
      if (node.type === 'Identifier') return node.name
      if (node.type === 'MemberExpression' && !node.computed) return rootIdentifierOf(node.object)
      return null
    }

    const isPipe = (node: ESTree.Node): boolean => isPipeCall(node, pipeNames, PIPE_NAME)

    const isCurriedRunStep = (node: ESTree.Node): boolean =>
      node.type === 'CallExpression' && node.arguments.length === 1 && isRunCall(node)

    const runSuccessOf = (node: ESTree.Node): boolean => {
      if (node.type === 'YieldExpression') {
        return node.argument !== null && runSuccessOf(node.argument)
      }
      if (node.type !== 'CallExpression') return false
      if (isRunCall(node)) return true
      if (!isPipe(node)) return false
      const last = node.arguments.at(-1)
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
        CONTINUATION_NAMES.some((name) => name === property.name)
    }

    const inputOf = (call: ESTree.CallExpression): ESTree.Node | null => {
      if (call.arguments.length === 2) return call.arguments[1] ?? null
      if (call.arguments.length === 1) return call.arguments[0] ?? null
      return null
    }

    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      const source = String(node.source.value)
      if (source === MODULE_SOURCE) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            descriptionNamespaces.add(specifier.local.name)
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === DESCRIPTION_NAMESPACE
          ) {
            descriptionNamespaces.add(specifier.local.name)
          }
        }
        return
      }
      if (EFFECT_SOURCES.some((effectSource) => effectSource === source)) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            effectNamespaces.add(specifier.local.name)
          } else if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            if (specifier.imported.name === EFFECT_NAMESPACE) effectNamespaces.add(specifier.local.name)
            if (specifier.imported.name === PIPE_NAME) pipeNames.add(specifier.local.name)
          }
        }
        return
      }
      if (PIPE_SOURCES.some((pipeSource) => pipeSource === source)) {
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === PIPE_NAME
          ) {
            pipeNames.add(specifier.local.name)
          }
        }
      }
    }

    const enterFunction = (node: FunctionNode): void => {
      const scope = new Set<string>()
      if (continuationCallbacks.has(node)) {
        for (const param of node.params) collectPatternIdentifiers(param, scope)
      }
      scopes.push(scope)
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
      'ArrowFunctionExpression:exit': (): void => {
        scopes.pop()
      },
      'FunctionDeclaration:exit': (): void => {
        scopes.pop()
      },
      'FunctionExpression:exit': (): void => {
        scopes.pop()
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        const scope = scopes.at(-1)
        if (scope === undefined) return
        if (node.init !== null && runSuccessOf(node.init)) collectPatternIdentifiers(node.id, scope)
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        const scope = scopes.at(-1)
        if (scope !== undefined && node.left.type === 'Identifier') scope.delete(node.left.name)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isRunCall(node)) {
          const scope = scopes.at(-1)
          if (scope !== undefined) {
            const input = inputOf(node)
            const root = input === null ? null : rootIdentifierOf(input)
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
        if (isPipe(node)) {
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
