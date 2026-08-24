import babel from '@babel/core'

import type { Mutator, MutatorContext } from './mutator.js'
import { mutateRegexPattern } from './regex-mutation.js'

const { types } = babel

export const regexMutator: Mutator = function*(node, context: MutatorContext) {
  if (types.isRegExpLiteral(node)) {
    for (const replacementPattern of mutateRegexPattern(node.pattern, node.flags)) {
      yield types.regExpLiteral(replacementPattern, node.flags)
    }
  } else if (types.isStringLiteral(node) && isObviousRegexString(node, context)) {
    const parent = context.parent
    if (parent !== undefined && types.isNewExpression(parent)) {
      const flags = getFlags(parent)
      for (const replacementPattern of mutateRegexPattern(node.value, flags)) {
        yield types.stringLiteral(replacementPattern)
      }
    }
  }
}

function isObviousRegexString(node: babel.types.StringLiteral, context: MutatorContext): boolean {
  const parent = context.parent
  if (
    parent === undefined || !types.isNewExpression(parent) || !types.isIdentifier(parent.callee) ||
    parent.callee.name !== RegExp.name
  ) {
    return false
  }
  return parent.arguments[0] === node
}

function getFlags(node: babel.types.NewExpression): string | undefined {
  const secondArg = node.arguments[1]
  if (secondArg !== undefined && types.isStringLiteral(secondArg)) {
    return secondArg.value
  }
  return undefined
}
