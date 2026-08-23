import babel from '@babel/core'

import { deepCloneNode } from '../util/index.js'

import { type NodeMutator } from './index.js'

const { types } = babel

enum UpdateOperators {
  '++' = '--',
  '--' = '++',
}

export const updateOperatorMutator: NodeMutator = {
  name: 'UpdateOperator',

  *mutate(path) {
    if (path.isUpdateExpression()) {
      yield types.updateExpression(
        UpdateOperators[path.node.operator],
        deepCloneNode(path.node.argument),
        path.node.prefix,
      )
    }
  },
}
