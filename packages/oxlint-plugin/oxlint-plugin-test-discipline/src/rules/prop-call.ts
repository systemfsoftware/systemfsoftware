import type { ESTree } from '@oxlint/plugins'
import { Array as A, Option } from 'effect'

export const PROP_MODIFIERS: ReadonlySet<string> = new Set(['only', 'skip', 'todo'])

export const isPropCallee = (callee: ESTree.CallExpression['callee']): boolean => {
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false
  if (callee.property.name === 'prop') {
    const object = callee.object
    if (object.type === 'Identifier') return object.name === 'it'
    return object.type === 'MemberExpression' &&
      object.property.type === 'Identifier' && object.property.name === 'effect' &&
      object.object.type === 'Identifier' && object.object.name === 'it'
  }
  return PROP_MODIFIERS.has(callee.property.name) && isPropCallee(callee.object)
}

export type PredicateFn = ESTree.ArrowFunctionExpression | ESTree.Function

export const getPredicate = (node: ESTree.CallExpression): Option.Option<PredicateFn> =>
  A.findLast(
    node.arguments,
    (arg): arg is PredicateFn => arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression',
  )
