import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types } = babel

const UnaryOperator = {
  '+': '-',
  '-': '+',
  '~': '',
} as const

export const unaryOperatorMutator: NodeMutator = {
  name: 'UnaryOperator',

  *mutate(node, _context: MutatorContext) {
    if (types.isUnaryExpression(node) && isSupported(node.operator) && node.prefix) {
      const mutatedOperator = UnaryOperator[node.operator]
      const replacement = isPlusOrMinus(mutatedOperator)
        ? types.unaryExpression(mutatedOperator, deepCloneNode(node.argument))
        : deepCloneNode(node.argument)
      yield replacement
    }
  },
}

function isSupported(operator: string): operator is keyof typeof UnaryOperator {
  return Object.keys(UnaryOperator).includes(operator)
}

function isPlusOrMinus(operator: string): operator is '-' | '+' {
  return operator === '-' || operator === '+'
}
