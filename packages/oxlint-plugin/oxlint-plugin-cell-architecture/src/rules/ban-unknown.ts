import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Effect, Schema as S } from 'effect'

import { ACTUAL, EXPECTED, FIX, meta, NAME, OptionsElement } from './ban-unknown.config.js'

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'banned'

interface TypeParameterNode {
  readonly type: 'TSTypeParameter'
  readonly default: ESTree.Node | null
}

interface CatchClauseNode {
  readonly type: 'CatchClause'
  readonly param: ESTree.Node | null
}

interface PredicateCarrier {
  readonly params: readonly unknown[]
  readonly returnType: { readonly typeAnnotation: ESTree.Node | null } | null | undefined
}

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const parentOf = (node: ESTree.Node): ESTree.Node | null => {
  const parent: unknown = node.parent
  return isNode(parent) ? parent : null
}

const isTypeParameter = (node: ESTree.Node): node is ESTree.Node & TypeParameterNode => node.type === 'TSTypeParameter'

const isCatchClause = (node: ESTree.Node): node is ESTree.Node & CatchClauseNode => node.type === 'CatchClause'

const isPredicateCarrier = (node: ESTree.Node): node is ESTree.Node & PredicateCarrier => {
  if (!('params' in node) || !('returnType' in node)) return false
  const params: unknown = node.params
  return Array.isArray(params)
}

const contains = (value: unknown, target: ESTree.Node): boolean => {
  if (value === target) return true
  if (Array.isArray(value)) {
    for (const item of value) {
      if (contains(item, target)) return true
    }
    return false
  }
  if (!isNode(value)) return false
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    if (contains(child, target)) return true
  }
  return false
}

const isGenericDefault = (node: ESTree.Node): boolean => {
  const parent = parentOf(node)
  return parent !== null && isTypeParameter(parent) && parent.default === node
}

const isCatchBinding = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node
  while (current !== null) {
    const parent = parentOf(current)
    if (parent === null) return false
    if (isCatchClause(parent)) return parent.param !== null && contains(parent.param, node)
    current = parent
  }
  return false
}

const isTypePredicateParameter = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node
  while (current !== null) {
    const parent = parentOf(current)
    if (parent === null) return false
    if (isPredicateCarrier(parent)) {
      const annotation = parent.returnType?.typeAnnotation
      if (annotation === undefined || annotation === null || annotation.type !== 'TSTypePredicate') return false
      return parent.params.some((param) => contains(param, node))
    }
    current = parent
  }
  return false
}

const decodeOptions = (input: unknown): S.Schema.Type<typeof OptionsElement> =>
  Effect.runSync(Effect.orDie(S.decodeUnknownEffect(OptionsElement)(input)))

export const banUnknown = defineRule({
  meta,
  create(context: Context) {
    const options = decodeOptions(context.options[0] ?? {})
    return {
      TSUnknownKeyword(node: ESTree.Node) {
        if (options.allowGenericDefault && isGenericDefault(node)) return
        if (options.allowTypePredicate && isTypePredicateParameter(node)) return
        if (options.allowCatchClause && isCatchBinding(node)) return
        context.report({
          node,
          messageId: 'banned',
          data: { name: NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
        })
      },
    }
  },
})
