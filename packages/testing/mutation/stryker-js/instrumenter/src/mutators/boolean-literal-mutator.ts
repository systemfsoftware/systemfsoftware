import babel from '@babel/core'

import { deepCloneNode } from '../util/index.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'
import { registerMutator } from './registry.js'

const { types } = babel

export const booleanLiteralMutator: NodeMutator = {
  name: 'BooleanLiteral',

  *mutate(node, _context: MutatorContext) {
    if (types.isBooleanLiteral(node)) {
      yield types.booleanLiteral(!node.value)
    }
    if (types.isUnaryExpression(node) && node.operator === '!' && node.prefix) {
      yield deepCloneNode(node.argument)
    }
  },
}

registerMutator(booleanLiteralMutator)
