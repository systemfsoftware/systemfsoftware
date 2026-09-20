import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  TOO_FEW_FEATURES_ACTUAL,
  TOO_FEW_FEATURES_EXPECTED,
  TOO_FEW_FEATURES_FIX,
  TOO_FEW_FEATURES_NAME,
  TOO_MANY_FEATURES_ACTUAL,
  TOO_MANY_FEATURES_EXPECTED,
  TOO_MANY_FEATURES_FIX,
  TOO_MANY_FEATURES_NAME,
} from './behaviour-one-feature-per-file.config.js'
import { INTEGRATION_SUFFIX } from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'tooFewFeatures' | 'tooManyFeatures'

const rootCalleeName = (callee: ESTree.Expression | ESTree.Super): string | null => {
  const descend = (current: ESTree.Expression | ESTree.Super): ESTree.Expression | ESTree.Super => {
    if (current.type === 'CallExpression') return descend(current.callee)
    if (current.type === 'MemberExpression') return descend(current.object)
    return current
  }
  const root = descend(callee)
  return root.type === 'Identifier' ? root.name : null
}

const isFeatureCallStatement = (statement: ESTree.Program['body'][number]): boolean => {
  if (statement.type !== 'ExpressionStatement') return false
  if (statement.expression.type !== 'CallExpression') return false
  return rootCalleeName(statement.expression.callee) === 'Feature'
}

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

const findSecondFeatureCall = (program: ESTree.Program): ESTree.Node | null => {
  let seen = 0
  for (const statement of program.body) {
    if (!isFeatureCallStatement(statement)) continue
    seen += 1
    if (seen === 2) return statement
  }
  return null
}

const countFeatureCalls = (program: ESTree.Program): number => {
  let count = 0
  for (const statement of program.body) {
    if (isFeatureCallStatement(statement)) count += 1
  }
  return count
}

const hasAnyFeatureCall = (program: ESTree.Program): boolean => {
  for (const statement of program.body) {
    if (isFeatureCallStatement(statement)) return true
  }
  return false
}

export const behaviourOneFeaturePerFile = defineRule({
  meta,
  create(context: Context) {
    return {
      'Program:exit'(node: ESTree.Program) {
        if (!isBehaviourTest(basenameOf(context.filename))) return
        const excess = findSecondFeatureCall(node)
        if (excess !== null) {
          const total = countFeatureCalls(node)
          context.report({
            node: excess,
            messageId: 'tooManyFeatures',
            data: {
              name: TOO_MANY_FEATURES_NAME,
              expected: TOO_MANY_FEATURES_EXPECTED,
              actual: `${TOO_MANY_FEATURES_ACTUAL} (${total} found)`,
              fix: TOO_MANY_FEATURES_FIX,
            },
          })
          return
        }
        if (!hasAnyFeatureCall(node)) {
          context.report({
            node: node.body[0] ?? node,
            messageId: 'tooFewFeatures',
            data: {
              name: TOO_FEW_FEATURES_NAME,
              expected: TOO_FEW_FEATURES_EXPECTED,
              actual: TOO_FEW_FEATURES_ACTUAL,
              fix: TOO_FEW_FEATURES_FIX,
            },
          })
        }
      },
    }
  },
})
