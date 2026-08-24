import babel from '@babel/core'
import * as weaponRegex from 'weapon-regex'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'

const { types } = babel

const weaponRegexOptions: weaponRegex.MutationOptions = { mutationLevels: [1] }

export const regexMutator: NodeMutator = {
  name: 'Regex',

  *mutate(node, context: MutatorContext) {
    if (types.isRegExpLiteral(node)) {
      for (const replacementPattern of mutatePattern(node.pattern, node.flags)) {
        yield types.regExpLiteral(replacementPattern, node.flags)
      }
    } else if (types.isStringLiteral(node) && isObviousRegexString(node, context)) {
      const parent = context.parent
      if (parent !== undefined && types.isNewExpression(parent)) {
        const flags = getFlags(parent)
        for (const replacementPattern of mutatePattern(node.value, flags)) {
          yield types.stringLiteral(replacementPattern)
        }
      }
    }
  },
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

function mutatePattern(pattern: string, flags: string | undefined): string[] {
  if (pattern.length === 0) {
    return []
  }
  try {
    return weaponRegex.mutate(pattern, flags, weaponRegexOptions).map((mutant) => mutant.pattern)
  } catch {
    return []
  }
}
