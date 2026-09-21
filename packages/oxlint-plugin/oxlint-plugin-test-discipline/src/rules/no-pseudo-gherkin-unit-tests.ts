import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  NO_LAYER_IN_FEATURE_ACTUAL,
  NO_LAYER_IN_FEATURE_EXPECTED,
  NO_LAYER_IN_FEATURE_FIX,
  NO_LAYER_IN_FEATURE_NAME,
} from './no-pseudo-gherkin-unit-tests.config.js'
import { INTEGRATION_SUFFIX } from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'noLayerInFeature'

const LAYER_METHODS: Record<string, true> = {
  withLayer: true,
  withScenarioLayer: true,
}

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

const hasLayerInChain = (callNode: ESTree.CallExpression): boolean => {
  let current: ESTree.Node = callNode
  while (current.type === 'CallExpression') {
    const calleeNode: ESTree.Expression | ESTree.Super = current.callee
    if (calleeNode.type === 'MemberExpression') {
      if (calleeNode.property.type === 'Identifier' && LAYER_METHODS[calleeNode.property.name] === true) {
        return true
      }
      current = calleeNode.object
    } else {
      break
    }
  }
  return false
}

const findRootFeatureCall = (callNode: ESTree.CallExpression): ESTree.CallExpression | null => {
  let current: ESTree.Node = callNode
  while (current.type === 'CallExpression') {
    const calleeNode: ESTree.Expression | ESTree.Super = current.callee
    if (calleeNode.type === 'Identifier' && calleeNode.name === 'Feature') {
      return current
    }
    if (calleeNode.type === 'MemberExpression') {
      current = calleeNode.object
    } else {
      break
    }
  }
  return null
}

export const noPseudoGherkinUnitTests = defineRule({
  meta,
  create(context: Context) {
    if (!isBehaviourTest(basenameOf(context.filename))) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
          if (node.callee.property.name === 'body') {
            const rootFeature = findRootFeatureCall(node)
            if (rootFeature !== null && !hasLayerInChain(node)) {
              context.report({
                node: rootFeature,
                messageId: 'noLayerInFeature',
                data: {
                  name: NO_LAYER_IN_FEATURE_NAME,
                  expected: NO_LAYER_IN_FEATURE_EXPECTED,
                  actual: NO_LAYER_IN_FEATURE_ACTUAL,
                  fix: NO_LAYER_IN_FEATURE_FIX,
                },
              })
            }
          }
        }
      },
    }
  },
})
