import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  DEFAULT_EXPECTED,
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  GLOBAL_OBJECTS,
  meta,
  SET_TIMEOUT,
} from './no-native-settimeout-in-effect.config.js'

export type MessageIds = 'forbiddenSetTimeout'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isSetTimeoutIdentifier = (node: ESTree.Node): boolean => node.type === 'Identifier' && node.name === SET_TIMEOUT

const isSetTimeoutMember = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.name === SET_TIMEOUT

const isSetTimeoutBracket = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.type === 'Literal' &&
  node.property.value === SET_TIMEOUT

const isSetTimeoutCallee = (node: ESTree.Node): boolean =>
  isSetTimeoutIdentifier(node) ||
  isSetTimeoutMember(node) ||
  isSetTimeoutBracket(node)

const isSetTimeoutAlias = (node: ESTree.Node, aliases: Set<string>): boolean => {
  if (node.type !== 'Identifier') return false
  return aliases.has(node.name)
}

export const noNativeSetTimeoutInEffect = defineRule({
  meta,
  create(context: Context) {
    let hasEffectImport = false
    const setTimeoutAliases = new Set<string>()

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return
        if (!node.init) return

        if (isSetTimeoutCallee(node.init)) {
          setTimeoutAliases.add(node.id.name)
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!hasEffectImport) return

        const callee = node.callee

        if (isSetTimeoutCallee(callee)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetTimeout',
            data: { expected: DEFAULT_EXPECTED },
          })
          return
        }

        if (isSetTimeoutAlias(callee, setTimeoutAliases)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetTimeout',
            data: { expected: DEFAULT_EXPECTED },
          })
        }
      },
    }
  },
})
