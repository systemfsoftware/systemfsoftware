import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  DEFAULT_EXPECTED,
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  LAYER_ASSEMBLY_MEMBERS,
  LAYER_NAMESPACE,
  meta,
  PIPE_NAME,
  PROVIDE_SERVICE_NAME,
  TEST_FILE_SUFFIX,
} from './no-captured-provide-service.config.js'

export type MessageIds = 'capturedProvideService'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isTestPath = (filename: string): boolean =>
  filename.includes('/__tests__/') ||
  filename.includes('/test/') ||
  filename.includes('/tests/') ||
  TEST_FILE_SUFFIX.test(filename)

const isFunctionNode = (node: ESTree.Node): boolean =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression'

const enclosingFunctionOf = (node: ESTree.Node): ESTree.Node | null => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (isFunctionNode(current)) return current
    current = current.parent
  }
  return null
}

const contains = (outer: ESTree.Node, inner: ESTree.Node): boolean =>
  outer.start <= inner.start && inner.end <= outer.end

const staticPropertyName = (callee: ESTree.Expression): string | null =>
  callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
    ? callee.property.name
    : null

const isLayerAssemblyCall = (node: ESTree.CallExpression): boolean => {
  const name = staticPropertyName(node.callee)
  if (name === null || !LAYER_ASSEMBLY_MEMBERS.includes(name)) return false
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === LAYER_NAMESPACE
  )
}

const isNodeLike = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const subtreeHoldsLayerAssembly = (node: ESTree.Node): boolean => {
  if (node.type === 'CallExpression' && isLayerAssemblyCall(node)) return true
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    if (isNodeLike(value)) {
      if (subtreeHoldsLayerAssembly(value)) return true
    } else if (Array.isArray(value)) {
      for (const element of value) {
        if (isNodeLike(element) && subtreeHoldsLayerAssembly(element)) return true
      }
    }
  }
  return false
}

const pipeReceiverOf = (node: ESTree.CallExpression): ESTree.Expression | null =>
  node.callee.type === 'MemberExpression' && staticPropertyName(node.callee) === PIPE_NAME
    ? node.callee.object
    : null

const insideLayerAssembly = (node: ESTree.Node, isLayerRooted: (n: ESTree.Node) => boolean): boolean => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (current.type === 'CallExpression') {
      if (isLayerAssemblyCall(current)) return true
      const receiver = pipeReceiverOf(current)
      if (receiver !== null && (subtreeHoldsLayerAssembly(receiver) || isLayerRooted(receiver))) {
        return true
      }
    }
    current = current.parent
  }
  return false
}

interface YieldBinding {
  readonly name: string
  readonly fn: ESTree.Node
}

export const noCapturedProvideService = defineRule({
  meta,
  create(context: Context) {
    if (isTestPath(context.filename)) {
      return {}
    }

    let hasEffectImport = false
    const yieldBindings: YieldBinding[] = []
    const layerLocals = new Set<string>()

    const rootedAtLayerLocal = (node: ESTree.Node): boolean => {
      if (node.type === 'Identifier') return layerLocals.has(node.name)
      if (node.type === 'CallExpression') {
        const receiver = pipeReceiverOf(node)
        return receiver !== null && rootedAtLayerLocal(receiver)
      }
      return false
    }

    const isLayerRooted = (node: ESTree.Node): boolean => node.type === 'Identifier' && layerLocals.has(node.name)

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type === 'Identifier' && node.init !== null) {
          if (subtreeHoldsLayerAssembly(node.init) || rootedAtLayerLocal(node.init)) {
            layerLocals.add(node.id.name)
          }
        }
        if (node.id.type !== 'Identifier') return
        const init = node.init
        if (init === null || init.type !== 'YieldExpression') return
        const fn = enclosingFunctionOf(node)
        if (fn === null) return
        yieldBindings.push({ name: node.id.name, fn })
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!hasEffectImport) return
        if (staticPropertyName(node.callee) !== PROVIDE_SERVICE_NAME) return
        const provided = node.arguments[1]
        if (provided === undefined || provided.type !== 'Identifier') return
        const captured = yieldBindings.find(
          (binding) => binding.name === provided.name && contains(binding.fn, node),
        )
        if (captured === undefined) return
        if (insideLayerAssembly(node, isLayerRooted)) return

        context.report({
          node,
          messageId: 'capturedProvideService',
          data: { expected: DEFAULT_EXPECTED, name: provided.name },
        })
      },
    }
  },
})
