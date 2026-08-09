import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option } from 'effect'
import { meta } from './no-silent-return.config.js'
import { getPredicate, isPropCallee, type PredicateFn } from './prop-call.js'

export type MessageIds = 'bareReturn' | 'nonBooleanReturn' | 'missingReturn' | 'nonBooleanBody'

const BOOLEAN_PRODUCING_OPERATORS: ReadonlySet<string> = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'instanceof',
  'in',
  '!',
])

const LOOP_LIKE: ReadonlySet<string> = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'LabeledStatement',
])

type LoopLike =
  | ESTree.ForStatement
  | ESTree.ForInStatement
  | ESTree.ForOfStatement
  | ESTree.WhileStatement
  | ESTree.DoWhileStatement
  | ESTree.LabeledStatement

const isLoopLike = (stmt: ESTree.Statement | ESTree.Directive): stmt is LoopLike => LOOP_LIKE.has(stmt.type)

/**
 * Syntactically boolean-producing expressions. Identifiers, member
 * expressions, and calls are opaque — trusted to be boolean (documented in
 * the rule meta); everything else must PROVE it is boolean.
 */
const isBooleanShaped = (expr: ESTree.Expression): boolean => {
  if (expr.type === 'ChainExpression') return isBooleanShaped(expr.expression)
  if (expr.type === 'AwaitExpression') return isBooleanShaped(expr.argument)
  if (
    expr.type === 'TSAsExpression' || expr.type === 'TSSatisfiesExpression' ||
    expr.type === 'TSNonNullExpression' || expr.type === 'TSTypeAssertion'
  ) {
    return isBooleanShaped(expr.expression)
  }
  switch (expr.type) {
    case 'Literal':
      return typeof expr.value === 'boolean'
    case 'UnaryExpression':
    case 'BinaryExpression':
      return BOOLEAN_PRODUCING_OPERATORS.has(expr.operator)
    case 'LogicalExpression':
      return expr.operator !== '??' && isBooleanShaped(expr.left) && isBooleanShaped(expr.right)
    case 'ConditionalExpression':
      return isBooleanShaped(expr.consequent) && isBooleanShaped(expr.alternate)
    case 'CallExpression':
    case 'Identifier':
    case 'MemberExpression':
      return true
    default:
      return false
  }
}

const report = (
  context: Context,
  node: ESTree.Node,
  messageId: MessageIds,
  actual: string,
): void => {
  context.report({
    node,
    messageId,
    data: {
      name: 'A silent exit from a property predicate',
      expected: 'return <boolean> on every code path — fast-check counts undefined as success',
      actual,
      fix: 'return a boolean verdict; to skip an input dynamically, call fc.pre(condition) instead',
    },
  })
}

const checkReturn = (context: Context, stmt: ESTree.ReturnStatement): void => {
  if (stmt.argument === null) {
    report(context, stmt, 'bareReturn', 'bare `return;` — the predicate exits with undefined, a silent pass')
    return
  }
  if (!isBooleanShaped(stmt.argument)) {
    report(context, stmt, 'nonBooleanReturn', `return of a non-boolean ${stmt.argument.type}`)
  }
}

const checkStatements = (context: Context, statements: readonly (ESTree.Statement | ESTree.Directive)[]): void => {
  for (const stmt of statements) {
    if (stmt.type === 'ReturnStatement') {
      checkReturn(context, stmt)
    } else if (stmt.type === 'IfStatement') {
      checkStatements(context, [stmt.consequent])
      if (stmt.alternate !== null) checkStatements(context, [stmt.alternate])
    } else if (stmt.type === 'BlockStatement') {
      checkStatements(context, stmt.body)
    } else if (stmt.type === 'SwitchStatement') {
      for (const switchCase of stmt.cases) checkStatements(context, switchCase.consequent)
    } else if (stmt.type === 'TryStatement') {
      checkStatements(context, [stmt.block])
      if (stmt.handler !== null) checkStatements(context, [stmt.handler.body])
      if (stmt.finalizer !== null) checkStatements(context, [stmt.finalizer])
    } else if (isLoopLike(stmt)) {
      checkStatements(context, [stmt.body])
    } else if (stmt.type === 'FunctionDeclaration') {
      if (stmt.generator) checkFn(context, stmt)
    }
  }
}

/**
 * Does every path through this statement EXIT the function (return or
 * throw)? Returns already reported by checkReturn count as exits — the tail
 * analysis only owns paths with no exit at all.
 */
const pathExits = (stmt: ESTree.Statement | ESTree.Directive): boolean => {
  switch (stmt.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
      return true
    case 'BlockStatement':
      return A.last(stmt.body).pipe(Option.exists(pathExits))
    case 'IfStatement':
      return stmt.alternate !== null && pathExits(stmt.consequent) && pathExits(stmt.alternate)
    case 'SwitchStatement':
      return A.some(stmt.cases, (switchCase) => switchCase.test === null) &&
        A.every(stmt.cases, (switchCase) => A.last(switchCase.consequent).pipe(Option.exists(pathExits)))
    case 'TryStatement':
      return pathExits(stmt.block) && (stmt.handler === null || pathExits(stmt.handler.body))
    default:
      return false
  }
}

/** Narrow an arbitrary ESTree-adjacent value to a walkable object record. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Narrow an object whose `type`/`generator` fields mark it as a generator function expression. */
const isGeneratorFunction = (value: unknown): value is ESTree.Function => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value['type'] !== 'FunctionExpression') return false
  return 'generator' in value && Boolean(value['generator'])
}

/** Collect generator functions (Effect.gen bodies are verdict carriers). */
const collectGenerators = (value: unknown): ESTree.Function[] => {
  const out: ESTree.Function[] = []
  const walk = (inner: unknown): void => {
    const items = Array.isArray(inner) ? inner : [inner]
    for (const item of items) {
      if (!isRecord(item)) continue
      if (item['type'] === 'FunctionExpression') {
        if (isGeneratorFunction(item)) out.push(item)
        continue
      }
      if (item['type'] === 'ArrowFunctionExpression') continue
      for (const key of Object.keys(item)) {
        if (key === 'parent') continue
        walk(item[key])
      }
    }
  }
  walk(value)
  return out
}

const checkFn = (context: Context, fn: PredicateFn): void => {
  const body = Option.getOrThrow(Option.fromNullable(fn.body))
  if (body.type !== 'BlockStatement') {
    if (!isBooleanShaped(body)) {
      report(context, body, 'nonBooleanBody', `predicate body is a non-boolean ${body.type}`)
    }
    for (const gen of collectGenerators(body)) checkFn(context, gen)
    return
  }
  checkStatements(context, body.body)
  for (const gen of collectGenerators(body)) checkFn(context, gen)
  const lastPathExits = A.last(body.body).pipe(Option.exists(pathExits))
  if (!lastPathExits) {
    report(
      context,
      fn,
      'missingReturn',
      'the predicate can fall off the end without returning — undefined is a silent pass',
    )
  }
}

export const noSilentReturn = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isPropCallee(node.callee)) return
        Option.match(getPredicate(node), {
          onNone: () => {},
          onSome: (predicate) => checkFn(context, predicate),
        })
      },
    }
  },
})
