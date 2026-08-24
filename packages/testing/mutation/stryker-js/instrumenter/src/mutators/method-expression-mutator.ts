import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import type { Mutator, MutatorContext } from './mutator.js'

const { types } = babel

const baseReplacements: Record<string, string | null> = {
  charAt: null,
  endsWith: 'startsWith',
  every: 'some',
  filter: null,
  reverse: null,
  slice: null,
  sort: null,
  substr: null,
  substring: null,
  toLocaleLowerCase: 'toLocaleUpperCase',
  toLowerCase: 'toUpperCase',
  trim: null,
  trimEnd: 'trimStart',
  min: 'max',
  setDate: 'setTime',
  setFullYear: 'setMonth',
  setHours: 'setMinutes',
  setSeconds: 'setMilliseconds',
  setUTCDate: 'setTime',
  setUTCFullYear: 'setUTCMonth',
  setUTCHours: 'setUTCMinutes',
  setUTCSeconds: 'setUTCMilliseconds',
}

const noReverseReplacements = ['getUTCDate', 'setUTCDate']

const replacements: Record<string, string | null> = { ...baseReplacements }
for (const key of Object.keys(baseReplacements)) {
  const value = baseReplacements[key]
  if (value !== null && value !== undefined && !noReverseReplacements.includes(key)) {
    replacements[value] = key
  }
}

export const methodExpressionMutator: Mutator = function*(node, _context: MutatorContext) {
  if (!(types.isCallExpression(node) || types.isOptionalCallExpression(node))) {
    return
  }

  const { callee } = node
  if (
    !(types.isMemberExpression(callee) || types.isOptionalMemberExpression(callee)) ||
    !types.isIdentifier(callee.property)
  ) {
    return
  }

  const newName = replacements[callee.property.name]
  if (newName === undefined) {
    return
  }

  if (newName === null) {
    yield deepCloneNode(callee.object)
    return
  }

  const nodeArguments = node.arguments.map((argumentNode) => deepCloneNode(argumentNode))

  const mutatedCallee = types.isMemberExpression(callee)
    ? types.memberExpression(deepCloneNode(callee.object), types.identifier(newName), false, callee.optional)
    : types.optionalMemberExpression(deepCloneNode(callee.object), types.identifier(newName), false, callee.optional)

  yield types.isCallExpression(node)
    ? types.callExpression(mutatedCallee, nodeArguments)
    : types.optionalCallExpression(mutatedCallee, nodeArguments, node.optional)
}
