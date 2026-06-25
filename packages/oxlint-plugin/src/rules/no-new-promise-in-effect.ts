// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type MessageIds = 'forbiddenNewPromise'

const DEFAULT_EXPECTED = 'Effect.async or Promise.withResolvers'
const DEFAULT_FIX =
  'Replace with Effect.async for Effect pipelines, or Promise.withResolvers for native Promise composition'
const EFFECT_MODULE = 'effect'
const EFFECT_SOURCE_PREFIX = 'effect/'
const EFFECT_SCOPED_PREFIX = '@effect/'
const PROMISE_NAME = 'Promise'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isNewPromiseWithExecutor = (node: ESTree.NewExpression): boolean => {
  if (node.callee.type !== 'Identifier' || node.callee.name !== PROMISE_NAME) return false
  if (node.arguments.length === 0) return false
  const firstArg = node.arguments[0]
  return firstArg !== undefined &&
    (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression')
}

export const noNewPromiseInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'When Effect is imported, ban new Promise(executor). Use Effect.async or Promise.withResolvers instead.',
    },
    schema: [],
    messages: {
      forbiddenNewPromise:
        '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
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
