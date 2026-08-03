import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  DEFAULT_EXPECTED,
  DEFAULT_FIX,
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  meta,
  PROMISE_NAME,
} from './no-new-promise-in-effect.config.js'

export type MessageIds = 'forbiddenNewPromise'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isNewPromiseWithExecutor = (node: ESTree.NewExpression): boolean => {
  if (node.callee.type !== 'Identifier' || node.callee.name !== PROMISE_NAME) return false
  const firstArg = node.arguments[0]
  if (firstArg === undefined) return false
  return firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression'
}

export const noNewPromiseInEffect = defineRule({
  meta,
  create(context: Context) {
    let hasEffectImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      NewExpression(node: ESTree.NewExpression) {
        if (!hasEffectImport) return
        if (!isNewPromiseWithExecutor(node)) return

        context.report({
          node: node.callee,
          messageId: 'forbiddenNewPromise',
          data: {
            expected: DEFAULT_EXPECTED,
            actual: 'new Promise(executor)',
            fix: DEFAULT_FIX,
          },
        })
      },
    }
  },
})
