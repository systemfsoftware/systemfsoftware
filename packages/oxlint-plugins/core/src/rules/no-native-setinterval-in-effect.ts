import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  CLEAR_INTERVAL,
  DEFAULT_EXPECTED_CLEARINTERVAL,
  DEFAULT_EXPECTED_SETINTERVAL,
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  GLOBAL_OBJECTS,
  meta,
  SET_INTERVAL,
} from './no-native-setinterval-in-effect.config.js'

export type MessageIds = 'forbiddenSetInterval' | 'forbiddenClearInterval'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isIntervalIdentifier = (node: ESTree.Node, name: string): boolean =>
  node.type === 'Identifier' && node.name === name

const isIntervalMember = (
  node: ESTree.Node,
  methodName: string,
): boolean =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.name === methodName

const isIntervalBracket = (
  node: ESTree.Node,
  methodName: string,
): boolean =>
  node.type === 'MemberExpression' &&
  node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.type === 'Literal' &&
  node.property.value === methodName

const isIntervalCallee = (node: ESTree.Node, methodName: string): boolean =>
  isIntervalIdentifier(node, methodName) ||
  isIntervalMember(node, methodName) ||
  isIntervalBracket(node, methodName)

const isIntervalAlias = (node: ESTree.Node, aliases: Set<string>): boolean => {
  if (node.type !== 'Identifier') return false
  return aliases.has(node.name)
}

export const noNativeSetIntervalInEffect = defineRule({
  meta,
  create(context: Context) {
    let hasEffectImport = false
    const setIntervalAliases = new Set<string>()
    const clearIntervalAliases = new Set<string>()

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return
        if (!node.init) return

        if (isIntervalCallee(node.init, SET_INTERVAL)) {
          setIntervalAliases.add(node.id.name)
        }
        if (isIntervalCallee(node.init, CLEAR_INTERVAL)) {
          clearIntervalAliases.add(node.id.name)
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!hasEffectImport) return

        const callee = node.callee

        if (isIntervalCallee(callee, SET_INTERVAL)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetInterval',
            data: { expected: DEFAULT_EXPECTED_SETINTERVAL },
          })
          return
        }

        if (isIntervalCallee(callee, CLEAR_INTERVAL)) {
          context.report({
            node: callee,
            messageId: 'forbiddenClearInterval',
            data: { expected: DEFAULT_EXPECTED_CLEARINTERVAL },
          })
          return
        }

        if (isIntervalAlias(callee, setIntervalAliases)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetInterval',
            data: { expected: DEFAULT_EXPECTED_SETINTERVAL },
          })
          return
        }

        if (isIntervalAlias(callee, clearIntervalAliases)) {
          context.report({
            node: callee,
            messageId: 'forbiddenClearInterval',
            data: { expected: DEFAULT_EXPECTED_CLEARINTERVAL },
          })
        }
      },
    }
  },
})
