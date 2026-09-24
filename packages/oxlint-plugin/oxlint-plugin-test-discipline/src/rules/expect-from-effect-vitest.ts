import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  EFFECT_VITEST_SOURCE,
  EXPECT,
  meta,
  VIOLATION_ACTUAL,
  VIOLATION_EXPECTED,
  VIOLATION_FIX,
  VIOLATION_NAME,
  VITEST_SOURCE,
} from './expect-from-effect-vitest.config.js'

export type MessageIds = 'vitestExpect'

const isExpectSpecifier = (specifier: ESTree.ImportSpecifier): boolean => {
  const imported = specifier.imported
  return imported.type === 'Identifier' && imported.name === EXPECT
}

const isVitestSource = (node: ESTree.ImportDeclaration): boolean => node.source.value === VITEST_SOURCE

export const expectFromEffectVitest = defineRule({
  meta,
  create(context: Context) {
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!isVitestSource(node)) return
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          if (!isExpectSpecifier(specifier)) continue
          context.report({
            node: specifier,
            messageId: 'vitestExpect',
            data: {
              name: VIOLATION_NAME,
              expected: `${VIOLATION_EXPECTED} (imported from ${EFFECT_VITEST_SOURCE})`,
              actual: VIOLATION_ACTUAL,
              fix: VIOLATION_FIX,
            },
          })
        }
      },
    }
  },
})
