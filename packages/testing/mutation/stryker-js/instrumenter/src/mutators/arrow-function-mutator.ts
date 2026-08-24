import babel from '@babel/core'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types } = babel

export const arrowFunctionMutator: NodeMutator = {
  name: 'ArrowFunction',

  *mutate(node, _context: MutatorContext) {
    if (
      types.isArrowFunctionExpression(node) &&
      !types.isBlockStatement(node.body) &&
      !(types.isIdentifier(node.body) && node.body.name === 'undefined')
    ) {
      yield types.arrowFunctionExpression([], types.identifier('undefined'))
    }
  },
}
