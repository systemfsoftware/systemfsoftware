// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type MessageIds = 'forbiddenDateNow'

const DEFAULT_EXPECTED = 'yield* Clock.currentTimeMillis (Clock from effect)'
const EFFECT_MODULE = 'effect'
const EFFECT_SOURCE_PREFIX = 'effect/'
const EFFECT_SCOPED_PREFIX = '@effect/'
const DATE_NAME = 'Date'
const NOW_NAME = 'now'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isTestPath = (filename: string): boolean =>
  filename.includes('/__tests__/') ||
  filename.includes('/test/') ||
  filename.includes('/tests/') ||
  /\.(test|spec)\.[cm]?tsx?$/.test(filename)

const isDateNowCallee = (callee: ESTree.Node): boolean =>
  callee.type === 'MemberExpression' &&
  callee.object.type === 'Identifier' &&
  callee.object.name === DATE_NAME &&
  ((!callee.computed && callee.property.type === 'Identifier' && callee.property.name === NOW_NAME) ||
    (callee.computed && callee.property.type === 'Literal' && callee.property.value === NOW_NAME))

export const noDateNowInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'When Effect is imported, ban Date.now() (including inside Effect.sync). A clock read is an effect — use Clock.currentTimeMillis so it is controllable under TestClock.',
    },
    schema: [],
    messages: {
      forbiddenDateNow:
        'Date.now() is forbidden when Effect is imported. Expected: {{expected}}. Wrapping it as Effect.sync(() => Date.now()) is not an escape hatch — take the clock from the runtime.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    if (isTestPath(context.filename)) {
      return {}
    }

    let hasEffectImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!hasEffectImport) return
        if (!isDateNowCallee(node.callee)) return

        context.report({
          node: node.callee,
          messageId: 'forbiddenDateNow',
          data: { expected: DEFAULT_EXPECTED },
        })
      },
    }
  },
})
