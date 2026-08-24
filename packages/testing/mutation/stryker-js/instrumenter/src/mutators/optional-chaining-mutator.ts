import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'

const { types: t } = babel

export const optionalChainingMutator: Mutator = function*(node, _context: MutatorContext) {
  if (t.isOptionalMemberExpression(node) && node.optional) {
    yield t.optionalMemberExpression(
      t.cloneNode(node.object, true),
      t.cloneNode(node.property, true),
      node.computed,
      false,
    )
  }
  if (t.isOptionalCallExpression(node) && node.optional) {
    yield t.optionalCallExpression(
      t.cloneNode(node.callee, true),
      node.arguments.map((arg) => t.cloneNode(arg, true)),
      false,
    )
  }
}
