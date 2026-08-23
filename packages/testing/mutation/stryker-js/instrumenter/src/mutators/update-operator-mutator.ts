import babel from '@babel/core'

import { deepCloneNode } from '../util/index.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'
import { registerMutator } from './registry.js'

const { types } = babel

const UpdateOperators = {
  '++': '--',
  '--': '++',
} as const

export const updateOperatorMutator: NodeMutator = {
  name: 'UpdateOperator',

  *mutate(node, _context: MutatorContext) {
    if (types.isUpdateExpression(node)) {
      yield types.updateExpression(UpdateOperators[node.operator], deepCloneNode(node.argument), node.prefix)
    }
  },
}

registerMutator(updateOperatorMutator)
