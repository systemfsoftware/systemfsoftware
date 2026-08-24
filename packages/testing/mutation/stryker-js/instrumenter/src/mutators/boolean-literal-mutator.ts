import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

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
