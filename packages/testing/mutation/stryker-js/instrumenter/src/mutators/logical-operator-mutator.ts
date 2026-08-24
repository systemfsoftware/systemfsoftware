import { deepCloneNode } from '../babel/clone.js'

import babel from '@babel/core'
import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types } = babel

const logicalOperatorReplacements = Object.freeze(
  {
    '&&': '||',
    '||': '&&',
    '??': '&&',
  } as const,
)

export const logicalOperatorMutator: NodeMutator = {
  name: 'LogicalOperator',

  *mutate(node, _context: MutatorContext) {
    if (types.isLogicalExpression(node) && isSupported(node.operator)) {
      const mutatedOperator = logicalOperatorReplacements[node.operator]
      const replacement = deepCloneNode(node)
      replacement.operator = mutatedOperator
      yield replacement
    }
  },
}

function isSupported(operator: string): operator is keyof typeof logicalOperatorReplacements {
  return Object.keys(logicalOperatorReplacements).includes(operator)
}
