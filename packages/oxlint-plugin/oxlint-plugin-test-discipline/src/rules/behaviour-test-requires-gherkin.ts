import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  MISSING_MAKE_FEATURE_ACTUAL,
  MISSING_MAKE_FEATURE_EXPECTED,
  MISSING_MAKE_FEATURE_FIX,
  MISSING_MAKE_FEATURE_NAME,
} from './behaviour-test-requires-gherkin.config.js'
import { harnessLaneOf, lanesOf } from './lane.js'

export type MessageIds = 'missingMakeFeature'

const importsMakeFeature = (statement: ESTree.ImportDeclaration): boolean =>
  harnessLaneOf(statement.source.value) === 'behaviour' && statement.specifiers.some(
    (specifier) =>
      specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' &&
      specifier.imported.name === 'makeFeature',
  )

export const behaviourTestRequiresGherkin = defineRule({
  meta,
  create(context: Context) {
    return {
      Program(node: ESTree.Program) {
        if (!lanesOf(context).has('behaviour')) return
        const hasMakeFeature = node.body.some(
          (statement) => statement.type === 'ImportDeclaration' && importsMakeFeature(statement),
        )
        if (hasMakeFeature) return
        context.report({
          node,
          messageId: 'missingMakeFeature',
          data: {
            name: MISSING_MAKE_FEATURE_NAME,
            expected: MISSING_MAKE_FEATURE_EXPECTED,
            actual: MISSING_MAKE_FEATURE_ACTUAL,
            fix: MISSING_MAKE_FEATURE_FIX,
          },
        })
      },
    }
  },
})
