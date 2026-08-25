import babel from '@babel/core'

import type { Mutant } from '../mutant.js'

const { types } = babel

const COVER_MUTANT_HELPER = 'stryCov_9fa48'
const IS_MUTANT_ACTIVE_HELPER = 'stryMutAct_9fa48'

/**
 * returns syntax for `global.activeMutant === $mutantId`
 * @param mutantId The id of the mutant to switch
 */
export function mutantTestExpression(
  mutantId: string,
): babel.types.CallExpression {
  return types.callExpression(types.identifier(IS_MUTANT_ACTIVE_HELPER), [
    types.stringLiteral(mutantId),
  ])
}

/**
 * Returns a sequence of mutation coverage counters with an optional last expression.
 *
 * @example (global.__coverMutant__(0, 1), 40 + 2)
 * @param mutants The mutants for which covering syntax needs to be generated
 * @param targetExpression The original expression
 */
export function mutationCoverageSequenceExpression(
  mutants: Iterable<Mutant>,
  targetExpression?: babel.types.Expression,
): babel.types.Expression {
  const mutantIds = [...mutants].map((mutant) => types.stringLiteral(mutant.id))
  const sequence: babel.types.Expression[] = [
    types.callExpression(types.identifier(COVER_MUTANT_HELPER), mutantIds),
  ]
  if (targetExpression) {
    sequence.push(targetExpression)
  }
  return types.sequenceExpression(sequence)
}
