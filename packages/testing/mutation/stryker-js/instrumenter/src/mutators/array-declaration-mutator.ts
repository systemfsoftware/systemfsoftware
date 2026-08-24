import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types } = babel

export const arrayDeclarationMutator: NodeMutator = {
  name: 'ArrayDeclaration',

  *mutate(node, _context: MutatorContext) {
    if (types.isArrayExpression(node)) {
      const replacement = node.elements.length
        ? types.arrayExpression()
        : types.arrayExpression([types.stringLiteral('Stryker was here')])
      yield replacement
    }
    if (
      (types.isCallExpression(node) || types.isNewExpression(node)) &&
      types.isIdentifier(node.callee) &&
      node.callee.name === 'Array'
    ) {
      const mutatedCallArgs = node.arguments.length ? [] : [types.arrayExpression()]
      const replacement = types.isNewExpression(node)
        ? types.newExpression(deepCloneNode(node.callee), mutatedCallArgs)
        : types.callExpression(deepCloneNode(node.callee), mutatedCallArgs)
      yield replacement
    }
  },
}
