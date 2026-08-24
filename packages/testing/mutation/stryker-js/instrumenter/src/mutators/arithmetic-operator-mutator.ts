import type { types } from '@babel/core'
import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types: t } = babel

const arithmeticOperatorReplacements = Object.freeze(
  {
    '+': '-',
    '-': '+',
    '*': '/',
    '/': '*',
    '%': '*',
  } as const,
)

export const arithmeticOperatorMutator: NodeMutator = {
  name: 'ArithmeticOperator',

  *mutate(node, _context: MutatorContext) {
    if (t.isBinaryExpression(node) && isSupported(node.operator, node)) {
      const mutatedOperator = arithmeticOperatorReplacements[node.operator]
      const replacement = deepCloneNode(node)
      replacement.operator = mutatedOperator
      yield replacement
    }
  },
}

function isSupported(
  operator: string,
  node: types.BinaryExpression,
): operator is keyof typeof arithmeticOperatorReplacements {
  if (!Object.keys(arithmeticOperatorReplacements).includes(operator)) {
    return false
  }

  const stringTypes = ['StringLiteral', 'TemplateLiteral']
  const leftType = t.isBinaryExpression(node.left) ? node.left.right.type : node.left.type

  if (stringTypes.includes(node.right.type) || stringTypes.includes(leftType)) {
    return false
  }

  return true
}
