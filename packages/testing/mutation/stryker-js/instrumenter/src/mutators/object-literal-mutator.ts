import babel from '@babel/core'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'
import { registerMutator } from './registry.js'

const { types } = babel

export const objectLiteralMutator: NodeMutator = {
  name: 'ObjectLiteral',

  *mutate(node, _context: MutatorContext) {
    if (types.isObjectExpression(node) && node.properties.length > 0) {
      yield types.objectExpression([])
    }
  },
}

registerMutator(objectLiteralMutator)
