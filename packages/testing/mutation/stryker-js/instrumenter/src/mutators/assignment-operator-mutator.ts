import type { types as t } from '@babel/core'

import { deepCloneNode } from '../util/index.js'

import babel from '@babel/core'
import { type MutatorContext, type NodeMutator } from './node-mutator.js'
import { registerMutator } from './registry.js'

const { types } = babel

const assignmentOperatorReplacements = Object.freeze(
  {
    '+=': '-=',
    '-=': '+=',
    '*=': '/=',
    '/=': '*=',
    '%=': '*=',
    '<<=': '>>=',
    '>>=': '<<=',
    '&=': '|=',
    '|=': '&=',
    '&&=': '||=',
    '||=': '&&=',
    '??=': '&&=',
  } as const,
)

const stringTypes = Object.freeze(['StringLiteral', 'TemplateLiteral'])
const stringAssignmentTypes = Object.freeze(['&&=', '||=', '??='])

export const assignmentOperatorMutator: NodeMutator = {
  name: 'AssignmentOperator',

  *mutate(node, _context: MutatorContext) {
    if (types.isAssignmentExpression(node) && isSupportedAssignmentOperator(node.operator) && isSupported(node)) {
      const mutatedOperator = assignmentOperatorReplacements[node.operator]
      const replacement = deepCloneNode(node)
      replacement.operator = mutatedOperator
      yield replacement
    }
  },
}

function isSupportedAssignmentOperator(operator: string): operator is keyof typeof assignmentOperatorReplacements {
  return Object.keys(assignmentOperatorReplacements).includes(operator)
}

function isSupported(node: t.AssignmentExpression): boolean {
  if (stringTypes.includes(node.right.type) && !stringAssignmentTypes.includes(node.operator)) {
    return false
  }

  return true
}

registerMutator(assignmentOperatorMutator)
