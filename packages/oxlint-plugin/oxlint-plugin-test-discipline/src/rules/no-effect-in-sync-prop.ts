import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import {
  EFFECT_PREDICATE_ACTUAL,
  EFFECT_PREDICATE_EXPECTED,
  EFFECT_PREDICATE_FIX,
  EFFECT_PREDICATE_NAME,
  meta,
} from './no-effect-in-sync-prop.config.js'
import { getPredicate, type PredicateFn, PROP_MODIFIERS } from './prop-call.js'

export type MessageIds = 'effectInSyncProp'

const SYNC_PROP_ROOTS: Record<string, true> = { it: true, test: true }

const EFFECT_NAMESPACE = 'Effect' as const

const syncPropRootOf = (
  callee: ESTree.CallExpression['callee'],
): Option.Option<ESTree.MemberExpression> => {
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return Option.none()
  if (PROP_MODIFIERS.has(callee.property.name)) return syncPropRootOf(callee.object)
  if (callee.property.name !== 'prop') return Option.none()
  const { object } = callee
  if (object.type === 'Identifier' && SYNC_PROP_ROOTS[object.name] === true) return Option.some(callee)
  return Option.none()
}

const isEffectNamespaceCall = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.property.type === 'Identifier' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === EFFECT_NAMESPACE

const isEffectBuilt = (node: ESTree.Node): boolean => {
  switch (node.type) {
    case 'ChainExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      return isEffectBuilt(node.expression)
    case 'AwaitExpression':
      return isEffectBuilt(node.argument)
    case 'CallExpression':
      if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
        if (node.callee.property.name === 'pipe') return isEffectBuilt(node.callee.object)
      }
      return isEffectNamespaceCall(node)
    default:
      return false
  }
}

const LOOP_LIKE: Record<string, true> = {
  ForStatement: true,
  ForInStatement: true,
  ForOfStatement: true,
  WhileStatement: true,
  DoWhileStatement: true,
  LabeledStatement: true,
}

type LoopLike =
  | ESTree.ForStatement
  | ESTree.ForInStatement
  | ESTree.ForOfStatement
  | ESTree.WhileStatement
  | ESTree.DoWhileStatement
  | ESTree.LabeledStatement

const isLoopLike = (stmt: ESTree.Statement | ESTree.Directive): stmt is LoopLike => LOOP_LIKE[stmt.type] === true

const returnsEffectFrom = (stmt: ESTree.Statement | ESTree.Directive): boolean => {
  switch (stmt.type) {
    case 'ReturnStatement':
      return stmt.argument !== null && isEffectBuilt(stmt.argument)
    case 'IfStatement':
      return returnsEffectFrom(stmt.consequent) ||
        (stmt.alternate !== null && returnsEffectFrom(stmt.alternate))
    case 'BlockStatement':
      return stmt.body.some(returnsEffectFrom)
    case 'SwitchStatement':
      return stmt.cases.some((switchCase) => switchCase.consequent.some(returnsEffectFrom))
    case 'TryStatement':
      return stmt.block.body.some(returnsEffectFrom) ||
        (stmt.handler !== null && stmt.handler.body.body.some(returnsEffectFrom)) ||
        (stmt.finalizer !== null && stmt.finalizer.body.some(returnsEffectFrom))
    default:
      return isLoopLike(stmt) && returnsEffectFrom(stmt.body)
  }
}

const predicateReturnsEffect = (predicate: PredicateFn): boolean => {
  const body = Option.getOrThrow(Option.fromNullishOr(predicate.body))
  if (body.type !== 'BlockStatement') return isEffectBuilt(body)
  return body.body.some(returnsEffectFrom)
}

export const noEffectInSyncProp = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const prop = Option.getOrUndefined(syncPropRootOf(node.callee))
        if (prop === undefined) return
        const predicate = Option.getOrUndefined(getPredicate(node))
        if (predicate === undefined || !predicateReturnsEffect(predicate)) return
        context.report({
          node: prop,
          messageId: 'effectInSyncProp',
          data: {
            name: EFFECT_PREDICATE_NAME,
            expected: EFFECT_PREDICATE_EXPECTED,
            actual: EFFECT_PREDICATE_ACTUAL,
            fix: EFFECT_PREDICATE_FIX,
          },
        })
      },
    }
  },
})
