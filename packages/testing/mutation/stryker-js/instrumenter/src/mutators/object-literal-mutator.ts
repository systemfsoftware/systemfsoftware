import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'

const { types } = babel

export const objectLiteralMutator: Mutator = function*(node, _context: MutatorContext) {
  if (types.isObjectExpression(node) && node.properties.length > 0) {
    yield types.objectExpression([])
  }
}
