import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  DATE_NAME,
  DEFAULT_EXPECTED,
  EFFECT_MODULE,
  EFFECT_SCOPED_PREFIX,
  EFFECT_SOURCE_PREFIX,
  meta,
  NOW_NAME,
  TEST_FILE_SUFFIX,
} from './no-date-now-in-effect.config.js'

export type MessageIds = 'forbiddenDateNow'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isTestPath = (filename: string): boolean =>
  filename.includes('/__tests__/') ||
  filename.includes('/test/') ||
  filename.includes('/tests/') ||
  TEST_FILE_SUFFIX.test(filename)

const isDateNowCallee = (callee: ESTree.Node): boolean =>
  callee.type === 'MemberExpression' &&
  callee.object.type === 'Identifier' &&
  callee.object.name === DATE_NAME &&
  ((!callee.computed && callee.property.name === NOW_NAME) ||
    (callee.computed && callee.property.type === 'Literal' && callee.property.value === NOW_NAME))

export const noDateNowInEffect = defineRule({
  meta,
  create(context: Context) {
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
