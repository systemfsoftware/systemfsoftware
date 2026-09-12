import { Schema as S, SchemaAST } from 'effect'

export interface RecursionBudget {
  readonly maxDepth: number
  readonly depthSize: 'small' | 'medium' | 'large'
}

const isDepthSize = (value: unknown): value is RecursionBudget['depthSize'] =>
  value === 'small' || value === 'medium' || value === 'large'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const invalidBudget = (received: unknown): Error =>
  new Error(
    `recursionBudget: expected { maxDepth: integer >= 1, depthSize: 'small' | 'medium' | 'large' }, received ${
      JSON.stringify(received) ?? 'undefined'
    }`,
  )

const decodeBudget = (budget: unknown): RecursionBudget => {
  if (!isRecord(budget)) throw invalidBudget(budget)
  const { maxDepth, depthSize } = budget
  if (typeof maxDepth !== 'number' || !Number.isInteger(maxDepth) || maxDepth < 1) throw invalidBudget(budget)
  if (!isDepthSize(depthSize)) throw invalidBudget(budget)
  return { maxDepth, depthSize }
}

type ResolvedSuspends = Map<SchemaAST.Suspend, SchemaAST.AST>

const resolveSuspend = (ast: SchemaAST.Suspend, resolved: ResolvedSuspends): SchemaAST.AST => {
  const memo = resolved.get(ast)
  if (memo !== undefined) return memo
  const thunked = ast.thunk()
  resolved.set(ast, thunked)
  return thunked
}

const childAstsOf = (ast: SchemaAST.AST, resolved: ResolvedSuspends): ReadonlyArray<SchemaAST.AST> => {
  if (SchemaAST.isSuspend(ast)) return [resolveSuspend(ast, resolved)]
  if (SchemaAST.isUnion(ast)) return ast.types
  if (SchemaAST.isArrays(ast)) return [...ast.elements, ...ast.rest]
  if (SchemaAST.isObjects(ast)) {
    return [
      ...ast.propertySignatures.map((signature) => signature.type),
      ...ast.indexSignatures.map((signature) => signature.type),
    ]
  }
  if (SchemaAST.isDeclaration(ast)) return ast.typeParameters
  return []
}

const reachesCycle = (
  ast: SchemaAST.AST,
  target: SchemaAST.AST,
  resolved: ResolvedSuspends,
  seen: Set<SchemaAST.AST>,
): boolean => {
  if (ast === target) return true
  if (seen.has(ast)) return false
  seen.add(ast)
  return childAstsOf(ast, resolved).some((child) => reachesCycle(child, target, resolved, seen))
}

const terminalMembersOf = (union: SchemaAST.Union, target: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
  union.types.filter((member) => !reachesCycle(member, target, new Map(), new Set()))

const terminalCache = new WeakMap<SchemaAST.AST, ReadonlyArray<SchemaAST.AST>>()

const terminalsFor = (suspendAst: SchemaAST.AST, union: SchemaAST.Union): ReadonlyArray<SchemaAST.AST> => {
  const memo = terminalCache.get(suspendAst)
  if (memo !== undefined) return memo
  const terminals = terminalMembersOf(union, suspendAst)
  terminalCache.set(suspendAst, terminals)
  return terminals
}

const innerUnionOf = (suspendAst: SchemaAST.AST): SchemaAST.AST =>
  SchemaAST.isSuspend(suspendAst) ? suspendAst.thunk() : suspendAst

const planOf = (
  suspendAst: SchemaAST.AST,
): { readonly union: SchemaAST.Union; readonly terminals: ReadonlyArray<SchemaAST.AST> } | string => {
  const union = innerUnionOf(suspendAst)
  if (!SchemaAST.isUnion(union)) {
    return `recursionBudget: the suspended schema must be a Schema.Union, got ${union._tag}`
  }
  const terminals = terminalsFor(suspendAst, union)
  if (terminals.length === 0) {
    return 'recursionBudget: every member of the recursive union reaches the cycle — no finite generation path'
  }
  return { union, terminals }
}

export const budgetToArbitrary = (
  getSelf: () => S.Top,
  budget: unknown,
  depthIdentifier: string,
): S.Annotations.ToArbitrary.Declaration<unknown, readonly []> => {
  const { maxDepth, depthSize } = decodeBudget(budget)
  return () => (fc) => {
    const plan = planOf(getSelf().ast)
    if (typeof plan === 'string') throw new Error(plan)
    const terminal = fc.oneof(...plan.terminals.map((ast) => S.toArbitrary(S.make<S.Top>(ast))(fc)))
    return {
      arbitrary: fc.oneof(
        { depthIdentifier, maxDepth, depthSize },
        terminal,
        fc.constant(null).chain(() => S.toArbitrary(S.make<S.Top>(plan.union))(fc)),
      ),
      terminal,
    }
  }
}
