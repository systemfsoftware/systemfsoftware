import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import {
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  MAP_NAME,
  meta,
  Options,
} from './no-native-map-in-effect.config.js'

export type MessageIds = 'forbiddenMap'

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

const isMapCallee = (callee: ESTree.Node): boolean => {
  if (callee.type === 'Identifier') return callee.name === MAP_NAME
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name === MAP_NAME
  }
  return false
}

export const noNativeMapInEffect = defineRule({
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
        if (allow.has(MAP_NAME)) return
        if (!isMapCallee(node.callee)) return
        if (!isInsideEffectGen(node)) return

        const actual = node.arguments.length === 0 ? 'new Map()' : 'new Map(iterable)'

        context.report({
          node: node.callee,
          messageId: 'forbiddenMap',
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
