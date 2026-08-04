import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  FOREIGN_RUNNER_ACTUAL,
  FOREIGN_RUNNER_EXPECTED,
  FOREIGN_RUNNER_FIX,
  meta,
  MISSING_MAKE_FEATURE_ACTUAL,
  MISSING_MAKE_FEATURE_EXPECTED,
  MISSING_MAKE_FEATURE_FIX,
  MISSING_MAKE_FEATURE_NAME,
} from './behaviour-test-requires-gherkin.config.js'
import { FOREIGN_RUNNERS, GHERKIN_PACKAGE, INTEGRATION_SUFFIX, RUNNER_NAMES } from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'foreignRunner' | 'missingMakeFeature'

const ImportedIdentifier = S.Struct({ name: S.String })

const isMakeFeatureSpecifier = (specifier: ESTree.ImportSpecifier): boolean => {
  const imported = specifier.imported
  return imported.type === 'Identifier' && imported.name === 'makeFeature'
}

/**
 * `null` for any specifier that cannot name a runner. The decode is unreachable
 * for a string-literal import name because the narrowing above rejects it first;
 * it exists so removing that narrowing fails loudly instead of silently.
 */
const foreignRunnerNameOf = (specifier: ESTree.ImportSpecifier): string | null => {
  if (specifier.imported.type !== 'Identifier') return null
  const { name } = S.decodeUnknownSync(ImportedIdentifier)(specifier.imported)
  return RUNNER_NAMES.has(name) ? name : null
}

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

export const behaviourTestRequiresGherkin = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    return {
      Program(node: ESTree.Program) {
        if (!isBehaviourTest(basename)) return
        let hasMakeFeature = false
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const sourceValue = statement.source.value
          if (sourceValue === GHERKIN_PACKAGE) {
            for (const specifier of statement.specifiers) {
              if (specifier.type !== 'ImportSpecifier') continue
              if (isMakeFeatureSpecifier(specifier)) hasMakeFeature = true
            }
          }
          if (!FOREIGN_RUNNERS.has(sourceValue)) continue
          for (const specifier of statement.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue
            const runnerName = foreignRunnerNameOf(specifier)
            if (runnerName === null) continue
            context.report({
              node: specifier,
              messageId: 'foreignRunner',
              data: {
                name: runnerName,
                expected: FOREIGN_RUNNER_EXPECTED,
                actual: FOREIGN_RUNNER_ACTUAL,
                fix: FOREIGN_RUNNER_FIX,
              },
            })
          }
        }
        if (!hasMakeFeature) {
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
        }
      },
    }
  },
})
