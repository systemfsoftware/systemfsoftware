import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'

const { types } = babel

export const arrowFunctionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (
    types.isArrowFunctionExpression(node) &&
    !types.isBlockStatement(node.body) &&
    !(types.isIdentifier(node.body) && node.body.name === 'undefined')
  ) {
    yield types.arrowFunctionExpression([], types.identifier('undefined'))
  }
}
