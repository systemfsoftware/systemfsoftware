import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'

const { types: t } = babel

const operators = {
  '<': ['<=', '>='],
  '<=': ['<', '>'],
  '>': ['>=', '<='],
  '>=': ['>', '<'],
  '==': ['!='],
  '!=': ['=='],
  '===': ['!=='],
  '!==': ['==='],
} as const

function isEqualityOperator(operator: string): operator is keyof typeof operators {
  return Object.keys(operators).includes(operator)
}

export const equalityOperatorMutator: Mutator = function*(node, _context: MutatorContext) {
  if (t.isBinaryExpression(node) && isEqualityOperator(node.operator)) {
    for (const mutableOperator of operators[node.operator]) {
      const replacement = t.cloneNode(node, true)
      replacement.operator = mutableOperator
      yield replacement
    }
  }
}
