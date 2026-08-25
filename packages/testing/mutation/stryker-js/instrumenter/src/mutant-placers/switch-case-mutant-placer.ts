import babel, { type types } from '@babel/core'

import { mutantTestExpression, mutationCoverageSequenceExpression } from './mutant-expression.js'

import { type MutantPlacer, nodeOfKind } from './mutant-placer.js'

/**
 * Places the mutants with consequent of a SwitchCase node. Uses an if-statement to do so.
 * @example
 *  case 'foo':
 *    if (stryMutAct_9fa48(0)) {} else {
 *      stryCov_9fa48(0);
 *      console.log('bar');
 *      break;
 *   }
 */
export const switchCaseMutantPlacer: MutantPlacer<types.SwitchCase> = {
  name: 'switchCaseMutantPlacer',
  canPlace(path) {
    return path.isSwitchCase()
  },
  place(path, appliedMutants) {
    let consequence: types.Statement = babel.types.blockStatement([
      babel.types.expressionStatement(
        mutationCoverageSequenceExpression(appliedMutants.keys()),
      ),
      ...path.node.consequent,
    ])
    for (const [mutant, appliedMutant] of appliedMutants) {
      const switchCase = nodeOfKind(mutant, appliedMutant, babel.types.isSwitchCase, 'a switch case')
      consequence = babel.types.ifStatement(
        mutantTestExpression(mutant.id),
        babel.types.blockStatement(switchCase.consequent),
        consequence,
      )
    }
    path.replaceWith(babel.types.switchCase(path.node.test, [consequence]))
  },
}
