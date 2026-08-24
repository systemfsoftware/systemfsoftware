import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import type { Mutator, MutatorContext } from './mutator.js'

const { types } = babel

const UpdateOperators = {
  '++': '--',
  '--': '++',
} as const

export const updateOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (types.isUpdateExpression(node)) {
    yield types.updateExpression(UpdateOperators[node.operator], deepCloneNode(node.argument), node.prefix)
  }
}
