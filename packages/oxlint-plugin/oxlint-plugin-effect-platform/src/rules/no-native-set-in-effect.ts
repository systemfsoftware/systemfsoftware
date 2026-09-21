import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import {
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  meta,
  Options,
  SET_NAME,
} from './no-native-set-in-effect.config.js'

export type MessageIds = 'forbiddenSet'

const isSetCallee = (callee: ESTree.Node): boolean => callee.type === 'Identifier' && callee.name === SET_NAME

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isInsideEffectGen = (node: ESTree.Node | null): boolean => {
  if (node == null) return false
  const parent: ESTree.Node | null = node.parent
  if (
    parent !== null &&
    parent.type === 'CallExpression' &&
    parent.callee.type === 'MemberExpression' &&
    parent.callee.property.type === 'Identifier' &&
    parent.callee.property.name === 'gen'
  ) {
    return true
  }
  return isInsideEffectGen(parent)
}

export const noNativeSetInEffect = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const allow = new Set(options.allow)

    let hasEffectImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      NewExpression(node: ESTree.NewExpression) {
        if (!hasEffectImport) return
        if (allow.has(SET_NAME)) return
        if (!isSetCallee(node.callee)) return
        if (!isInsideEffectGen(node)) return

        const actual = node.arguments.length === 0 ? 'new Set()' : 'new Set(iterable)'

        context.report({
          node: node.callee,
          messageId: 'forbiddenSet',
          data: {
            expected: options.expected,
            actual,
            fix: options.fix,
          },
        })
      },
    }
  },
})
