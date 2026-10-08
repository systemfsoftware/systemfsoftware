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
import { FOREIGN_RUNNERS, GHERKIN_PACKAGE, RUNNER_NAMES } from './path.config.js'
import { basenameOf, isBehaviourBasename } from './path.js'

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
  const { name } = S.decodeSync(ImportedIdentifier)(specifier.imported)
  return RUNNER_NAMES.has(name) ? name : null
}

export const behaviourTestRequiresGherkin = defineRule({
  meta,
  create(context: Context) {
    const matchesSuffix = isBehaviourBasename(basenameOf(context.filename))
    return {
      Program(node: ESTree.Program) {
        let hasMakeFeature = false
        let importsGherkin = false
        const foreignRunnerReports: { readonly node: ESTree.Node; readonly runnerName: string }[] = []
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const sourceValue = statement.source.value
          if (sourceValue === GHERKIN_PACKAGE) {
            for (const specifier of statement.specifiers) {
              const isRuntime = statement.importKind !== 'type' &&
                !(specifier.type === 'ImportSpecifier' && specifier.importKind === 'type')
              if (isRuntime) importsGherkin = true
              if (specifier.type !== 'ImportSpecifier') continue
              if (isMakeFeatureSpecifier(specifier)) hasMakeFeature = true
            }
          }
          if (FOREIGN_RUNNERS[sourceValue] !== true) continue
          for (const specifier of statement.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue
            const runnerName = foreignRunnerNameOf(specifier)
            if (runnerName === null) continue
            foreignRunnerReports.push({ node: specifier, runnerName })
          }
        }
        // A behaviour test by name OR by an import of the Gherkin spec package:
        // either fact alone makes the harness discipline apply, so a rename off
        // `.integration.test.ts` cannot drop it (CONST-T12) while a Gherkin
        // import survives. The suffix stays legal naming (CONST-N2). The
        // `missingMakeFeature` branch keyed on the suffix alone would otherwise
        // let a renamed behaviour file skip the Gherkin feature silently.
        const isSubject = matchesSuffix || importsGherkin
        if (!isSubject) return
        for (const { node: at, runnerName } of foreignRunnerReports) {
          context.report({
            node: at,
            messageId: 'foreignRunner',
            data: {
              name: runnerName,
              expected: FOREIGN_RUNNER_EXPECTED,
              actual: FOREIGN_RUNNER_ACTUAL,
              fix: FOREIGN_RUNNER_FIX,
            },
          })
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
