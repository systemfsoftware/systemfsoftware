/// <reference types="vitest/import-meta" />
import { it } from '@effect/vitest'
import { Schema as S, SchemaAST } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const SAMPLE_DRAWS = 2000
const SAMPLE_SEEDS = 3

const STOCK_MAX_DEPTH = 2

const DEEP_DEPTH = STOCK_MAX_DEPTH + 2

const CALIBRATION_DRAWS = 512
const CALIBRATION_RUNS = 5
const SAFETY = 256
const BACKSTOP_FACTOR = 2
const BUDGET_LOWER_FACTOR = 64
const BUDGET_UPPER_FACTOR = 1024
const CALIBRATION_SEED = 0xC0FFEE
const PROBE_RUNS = 2
const PROBE_DRAWS = 200

const medianMs = (timings: ReadonlyArray<number>): number => {
  const ordered = [...timings].sort((left, right) => left - right)
  return ordered[ordered.length >> 1] ?? 0
}

const measureDrawMs = (arbitrary: fc.Arbitrary<unknown>): number => {
  const timings = Array.from({ length: CALIBRATION_RUNS }, () => {
    const started = performance.now()
    fc.sample(arbitrary, { numRuns: CALIBRATION_DRAWS, seed: CALIBRATION_SEED })
    return performance.now() - started
  })
  const median = medianMs(timings)
  if (median <= 0) throw new Error('recursionLaws calibration measured zero cost — clock unavailable')
  return median
}

const budgetCache = new WeakMap<fc.Arbitrary<unknown>, number>()

const budgetMsFor = (arbitrary: fc.Arbitrary<unknown>): number => {
  const cached = budgetCache.get(arbitrary)
  if (cached !== undefined) return cached
  const budget = measureDrawMs(arbitrary) * ((SAMPLE_DRAWS * SAMPLE_SEEDS) / CALIBRATION_DRAWS) * SAFETY
  budgetCache.set(arbitrary, budget)
  return budget
}

const lawOptionsFor = (arbitrary: fc.Arbitrary<unknown>) => {
  const budget = budgetMsFor(arbitrary)
  return {
    timeout: budget * BACKSTOP_FACTOR,
    fastCheck: { numRuns: SAMPLE_SEEDS, interruptAfterTimeLimit: budget, markInterruptAsFailure: true },
  } as const
}

const budgetFromObject = (annotation: object | null): { readonly maxDepth: number } | undefined => {
  if (annotation === null) return undefined
  return maxDepthFromAnnotation(annotation)
}

const recursionBudgetAnnotation = (ast: SchemaAST.AST): unknown => SchemaAST.resolve(ast)?.['recursionBudget']

const numberBudget = (maxDepth: unknown): { readonly maxDepth: number } | undefined => {
  if (typeof maxDepth !== 'number') return undefined
  return { maxDepth }
}

const maxDepthFromAnnotation = (annotation: object): { readonly maxDepth: number } | undefined => {
  if (!('maxDepth' in annotation)) return undefined
  return numberBudget(annotation['maxDepth'])
}

const budgetOf = (ast: SchemaAST.AST): { readonly maxDepth: number } | undefined => {
  const annotation = recursionBudgetAnnotation(ast)
  if (typeof annotation !== 'object') return undefined
  return budgetFromObject(annotation)
}

const hasDerivationHook = (ast: SchemaAST.AST): boolean => SchemaAST.resolve(ast)?.['toArbitrary'] !== undefined

const resolveSuspend = (
  ast: SchemaAST.Suspend,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.AST => {
  const memo = resolved.get(ast)
  if (memo !== undefined) return memo
  const thunked = ast.thunk()
  resolved.set(ast, thunked)
  return thunked
}

const childAstsFromSuspend = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isSuspend(ast)) return undefined
  return [resolveSuspend(ast, resolved)]
}

const childAstsFromUnion = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isUnion(ast)) return undefined
  return ast.types
}

const childAstsFromArrays = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isArrays(ast)) return undefined
  return [...ast.elements, ...ast.rest]
}

const childAstsFromObjects = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isObjects(ast)) return undefined
  return [
    ...ast.propertySignatures.map((signature) => signature.type),
    ...ast.indexSignatures.map((signature) => signature.type),
  ]
}

const childAstsFromDeclaration = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (!SchemaAST.isDeclaration(ast)) return undefined
  return ast.typeParameters
}

const definedChildren = (
  left: ReadonlyArray<SchemaAST.AST> | undefined,
  right: ReadonlyArray<SchemaAST.AST> | undefined,
): ReadonlyArray<SchemaAST.AST> | undefined => {
  if (left !== undefined) return left
  return right
}

const emptyChildren = (children: ReadonlyArray<SchemaAST.AST> | undefined): ReadonlyArray<SchemaAST.AST> => {
  if (children !== undefined) return children
  return []
}

const childAstsOf = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> =>
  emptyChildren(
    definedChildren(
      definedChildren(
        definedChildren(childAstsFromSuspend(ast, resolved), childAstsFromUnion(ast)),
        definedChildren(childAstsFromArrays(ast), childAstsFromObjects(ast)),
      ),
      childAstsFromDeclaration(ast),
    ),
  )

const reachesUnseen = (
  ast: SchemaAST.AST,
  union: SchemaAST.Union,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  if (seen.has(ast)) return false
  seen.add(ast)
  return childAstsOf(ast, resolved).some((child) => reachesUnion(child, union, seen, resolved))
}

const reachesUnion = (
  ast: SchemaAST.AST,
  union: SchemaAST.Union,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  if (ast === union) return true
  return reachesUnseen(ast, union, seen, resolved)
}

const isRecursiveUnion = (
  union: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  const seen = new Set<SchemaAST.AST>()
  return union.types.some((member) => reachesUnion(member, union, seen, resolved))
}

const recursiveUnionOrUndefined = (
  node: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (!isRecursiveUnion(node, resolved)) return undefined
  return node
}

const unionIfRecursive = (
  node: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (!SchemaAST.isUnion(node)) return undefined
  return recursiveUnionOrUndefined(node, resolved)
}

const unionOrNextChild = (
  found: SchemaAST.Union | undefined,
  rest: ReadonlyArray<SchemaAST.AST>,
  visit: (node: SchemaAST.AST) => SchemaAST.Union | undefined,
): SchemaAST.Union | undefined => {
  if (found !== undefined) return found
  return firstChildUnion(rest, visit)
}

const firstChildUnion = (
  children: ReadonlyArray<SchemaAST.AST>,
  visit: (node: SchemaAST.AST) => SchemaAST.Union | undefined,
): SchemaAST.Union | undefined => {
  const [child, ...rest] = children
  if (child === undefined) return undefined
  return unionOrNextChild(visit(child), rest, visit)
}

const visitMarked = (
  node: SchemaAST.AST,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  seen.add(node)
  const here = unionIfRecursive(node, resolved)
  if (here !== undefined) return here
  return firstChildUnion(childAstsOf(node, resolved), (child) => visitUnseen(child, seen, resolved))
}

const visitUnseen = (
  node: SchemaAST.AST,
  seen: Set<SchemaAST.AST>,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): SchemaAST.Union | undefined => {
  if (seen.has(node)) return undefined
  return visitMarked(node, seen, resolved)
}

const firstRecursiveUnion = (ast: SchemaAST.AST): SchemaAST.Union | undefined => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  const seen = new Set<SchemaAST.AST>()
  return visitUnseen(ast, seen, resolved)
}

const isSuspensionOf = (root: SchemaAST.AST, union: SchemaAST.Union): boolean => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  return childAstsOf(root, resolved).includes(union)
}

const memberSchemaOf = (ast: SchemaAST.AST): S.Top => S.make<S.Top>(ast)

const maxDepthAmong = (values: ReadonlyArray<unknown>): number =>
  values.reduce((deepest: number, element) => Math.max(deepest, maxNestingDepthOf(element)), 0)

const objectNestingDepth = (value: object): number => 1 + maxDepthAmong(Object.values(value))

const objectNestingDepthOrNull = (value: object | null): number => {
  if (value === null) return 0
  return objectNestingDepth(value)
}

const objectDepthIfObject = (value: unknown): number => {
  if (typeof value !== 'object') return 0
  return objectNestingDepthOrNull(value)
}

const maxNestingDepthOf = (value: unknown): number => {
  if (Array.isArray(value)) return maxDepthAmong(value)
  return objectDepthIfObject(value)
}

const sampledAt = (arbitrary: fc.Arbitrary<unknown>, seed: number): ReadonlyArray<unknown> =>
  fc.sample(arbitrary, { numRuns: SAMPLE_DRAWS, seed })

const deepShareOf = (sample: ReadonlyArray<unknown>): number =>
  sample.filter((value) => maxNestingDepthOf(value) >= DEEP_DEPTH).length / sample.length

const coversEveryVariant = (sample: ReadonlyArray<unknown>, members: ReadonlyArray<S.Top>): boolean =>
  members.every((member) => sample.some((value) => S.is(member)(value)))

const isUnionAtRoot = (root: SchemaAST.AST, union: SchemaAST.Union): boolean => {
  if (root === union) return true
  return isSuspensionOf(root, union)
}

const isRootCycle = (root: SchemaAST.AST, union: SchemaAST.Union | undefined): union is SchemaAST.Union => {
  if (union === undefined) return false
  return isUnionAtRoot(root, union)
}

const rootCycleUnion = (root: SchemaAST.AST): SchemaAST.Union | undefined => {
  const union = firstRecursiveUnion(root)
  if (!isRootCycle(root, union)) return undefined
  return union
}

const throwIfMissingHook = (label: string, root: SchemaAST.AST): void => {
  if (hasDerivationHook(root)) return
  throw new Error(
    `recursionBudget is declared on ${label} but nothing materialized it — Budget_RequiresTransform: register the recursion-budget Vite plugin in this package's vitest configuration`,
  )
}

const assertDerivationHook = (
  label: string,
  root: SchemaAST.AST,
  budget: { readonly maxDepth: number } | undefined,
): void => {
  if (budget === undefined) return
  throwIfMissingHook(label, root)
}

const maxDepthOfBudget = (budget: { readonly maxDepth: number } | undefined): number => {
  if (budget === undefined) return STOCK_MAX_DEPTH
  return budget.maxDepth
}

const registerDeepShareLaw = (label: string, arbitrary: fc.Arbitrary<unknown>, maxDepth: number): void => {
  if (maxDepth <= STOCK_MAX_DEPTH) return
  it.prop(
    `∀s_${label}DeepShare_≠Zero`,
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareOf(sampledAt(arbitrary, seed)) > 0,
    lawOptionsFor(arbitrary),
  )
}

export const recursionLaws = <A, I>(label: string, schema: S.Codec<A, I>): void => {
  const root = schema.ast
  const union = rootCycleUnion(root)
  if (union === undefined) return
  const budget = budgetOf(root)
  assertDerivationHook(label, root, budget)
  const arbitrary = S.toArbitrary(schema)(fc)
  const members = union.types.map(memberSchemaOf)
  const maxDepth = maxDepthOfBudget(budget)

  it.prop(
    `∀x_${label}Nesting_≤MaxDepth1`,
    [arbitrary],
    ([value]) => maxNestingDepthOf(value) <= maxDepth + 1,
  )

  registerDeepShareLaw(label, arbitrary, maxDepth)

  it.prop(
    `∀s_${label}Variants_⊇Declared`,
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => coversEveryVariant(sampledAt(arbitrary, seed), members),
    lawOptionsFor(arbitrary),
  )
}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema: S, Exit } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  type Codec = S.Codec<unknown, unknown>

  const MAX_DEPTH = 6
  const NESTING_CAP = MAX_DEPTH + 1
  const DeepChain = S.Int.pipe(S.check(S.isBetween({ minimum: NESTING_CAP + 1, maximum: NESTING_CAP + 20 })))

  const Lit = S.TaggedStruct('Lit', { value: S.Finite })
  const Id = S.TaggedStruct('Id', { name: S.String })
  const Num = S.TaggedStruct('Num', { value: S.Finite })
  const Str = S.TaggedStruct('Str', { value: S.String })
  const Flag = S.TaggedStruct('Flag', { on: S.Boolean })

  const binaryOf = (recur: Codec): Codec => S.TaggedStruct('Binary', { left: recur, right: recur })
  const memberOf = (recur: Codec): Codec => S.TaggedStruct('Member', { object: recur, property: recur })
  const conditionalOf = (recur: Codec): Codec =>
    S.TaggedStruct('Conditional', { test: recur, consequent: recur, alternate: recur })
  const callOf = (recur: Codec): Codec => S.TaggedStruct('Call', { callee: recur, args: S.Array(recur) })

  const annotatedExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'LawExpr',
      recursionBudget: { maxDepth: MAX_DEPTH, depthSize: 'medium' },
    })
    return Expr
  }

  const stockExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    )
    return Expr
  }

  const ANNOTATED_EXPR = annotatedExpr()
  const STOCK_EXPR = stockExpr()

  const basePairOnly: S.Annotations.ToArbitrary.Declaration<unknown, readonly []> = () => (fc) =>
    fc.oneof(S.toArbitrary(Lit)(fc), S.toArbitrary(Id)(fc))

  const droppedMemberExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec => S.Union([Lit, Id, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'DroppedMemberExpr',
      toArbitrary: basePairOnly,
    })
    return Expr
  }

  const DROPPED_MEMBER_EXPR = droppedMemberExpr()

  const arbitraryCache = new Map<S.Constraint, fc.Arbitrary<unknown>>()

  const arbitraryOf = (schema: S.Constraint): fc.Arbitrary<unknown> => {
    const cached = arbitraryCache.get(schema)
    if (cached !== undefined) return cached
    const arbitrary = S.toArbitrary(schema)(fc)
    arbitraryCache.set(schema, arbitrary)
    return arbitrary
  }

  const deepShareAt = (schema: S.Constraint, seed: number): number => deepShareOf(sampledAt(arbitraryOf(schema), seed))

  const declaredMembersOf = (schema: S.Constraint): ReadonlyArray<S.Top> => {
    const union = firstRecursiveUnion(schema.ast)
    if (union === undefined) return []
    return union.types.map(memberSchemaOf)
  }

  const coversAt = (schema: S.Constraint, seed: number): boolean =>
    coversEveryVariant(sampledAt(arbitraryOf(schema), seed), declaredMembersOf(schema))

  const longestNestingAt = (schema: S.Constraint, seed: number): number =>
    sampledAt(arbitraryOf(schema), seed).reduce(
      (deepest: number, value) => Math.max(deepest, maxNestingDepthOf(value)),
      0,
    )

  const declaredCapOf = (schema: S.Constraint): number => {
    const budget = budgetOf(schema.ast)
    if (budget === undefined) return STOCK_MAX_DEPTH + 1
    return budget.maxDepth + 1
  }

  const hasInterrupted = (details: object): boolean => {
    if (!('interrupted' in details)) return false
    return details.interrupted === true
  }

  const isInterruptedFailure = (details: { readonly failed: boolean }): boolean => {
    if (!details.failed) return false
    return hasInterrupted(details)
  }

  const interruptedUnder = (limitMs: number, seed: number): boolean => {
    const details = fc.check(
      fc.property(arbitraryOf(ANNOTATED_EXPR), (value) => {
        fc.sample(arbitraryOf(ANNOTATED_EXPR), { numRuns: PROBE_DRAWS, seed })
        return maxNestingDepthOf(value) <= NESTING_CAP
      }),
      { numRuns: PROBE_RUNS, seed, interruptAfterTimeLimit: limitMs, markInterruptAsFailure: true },
    )
    return isInterruptedFailure(details)
  }

  const NON_RECURSIVE_SCHEMAS: ReadonlyArray<{ readonly ast: SchemaAST.AST }> = [
    S.String,
    S.Array(S.String),
    S.Struct({ a: S.String, b: S.String }),
    S.Struct({ outer: S.Struct({ inner: S.String }) }),
  ]

  const encodedChainOf = (depth: number): unknown => {
    let node: unknown = { _tag: 'Lit', value: 1 }
    for (let level = 1; level < depth; level += 1) {
      node = { _tag: 'Call', callee: node, args: [] }
    }
    return node
  }

  const decodedDepthOf = (depth: number): number => {
    const decoded = S.decodeUnknownExit(ANNOTATED_EXPR)(encodedChainOf(depth))
    if (!Exit.isSuccess(decoded)) return -1
    return maxNestingDepthOf(decoded.value)
  }

  it.prop(
    '∀s_NonRecursiveSchemas_⊥Cycle',
    [fc.constantFrom(...NON_RECURSIVE_SCHEMAS)],
    ([schema]) => firstRecursiveUnion(schema.ast) === undefined,
  )

  it.prop(
    '∀d_ChainPastCap_=Depth',
    [S.toArbitrary(DeepChain)(fc)],
    ([depth]) => decodedDepthOf(depth) === depth,
  )

  it.prop(
    '∀s_StockExprDeepShare_=Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(STOCK_EXPR, seed) === 0,
    lawOptionsFor(arbitraryOf(STOCK_EXPR)),
  )

  it.prop(
    '∀s_StockExprNesting_≤StockCap',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => longestNestingAt(STOCK_EXPR, seed) <= declaredCapOf(STOCK_EXPR),
    lawOptionsFor(arbitraryOf(STOCK_EXPR)),
  )

  it.prop(
    '∀s_DeclaredDeepShare_≠Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(ANNOTATED_EXPR, seed) > 0,
    lawOptionsFor(arbitraryOf(ANNOTATED_EXPR)),
  )

  const baseHeavyExpr = (): Codec => {
    const Expr: Codec = S.suspend(
      (): Codec =>
        S.Union([Lit, Id, Num, Str, Flag, binaryOf(Expr), memberOf(Expr), conditionalOf(Expr), callOf(Expr)]),
    ).annotate({
      identifier: 'BaseHeavyExpr',
      recursionBudget: { maxDepth: MAX_DEPTH, depthSize: 'medium' },
    })
    return Expr
  }

  const BASE_HEAVY_EXPR = baseHeavyExpr()

  it.prop(
    '∀s_BaseHeavyDeepShare_≠Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(BASE_HEAVY_EXPR, seed) > 0,
    lawOptionsFor(arbitraryOf(BASE_HEAVY_EXPR)),
  )

  it.prop(
    '∀s_CollapsedDeepShare_=Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(DROPPED_MEMBER_EXPR, seed) === 0,
    lawOptionsFor(arbitraryOf(DROPPED_MEMBER_EXPR)),
  )

  it.prop(
    '∀s_AnnotatedExprNesting_≤DeclaredCap',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => longestNestingAt(ANNOTATED_EXPR, seed) <= declaredCapOf(ANNOTATED_EXPR),
    lawOptionsFor(arbitraryOf(ANNOTATED_EXPR)),
  )

  it.prop(
    '∀s_AnnotatedExprVariants_⊇Declared',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => coversAt(ANNOTATED_EXPR, seed),
    lawOptionsFor(arbitraryOf(ANNOTATED_EXPR)),
  )

  it.prop(
    '∀s_DroppedMemberVariants_⊆Declared',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => !coversAt(DROPPED_MEMBER_EXPR, seed),
    lawOptionsFor(arbitraryOf(DROPPED_MEMBER_EXPR)),
  )

  it.prop(
    '∀s_TightBudget_⊥SilentOverrun',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => {
      const arbitrary = arbitraryOf(ANNOTATED_EXPR)
      const started = performance.now()
      fc.sample(arbitrary, { numRuns: PROBE_DRAWS, seed })
      const workMs = performance.now() - started
      return interruptedUnder(workMs / 4, seed) && !interruptedUnder(workMs * 4, seed)
    },
    { fastCheck: { numRuns: PROBE_RUNS } },
  )

  it.prop(
    '∀c_Budget_∈MeasuredBand',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => {
      const arbitrary = arbitraryOf(ANNOTATED_EXPR)
      const freshBudget = measureDrawMs(arbitrary) * (PROBE_DRAWS / CALIBRATION_DRAWS) * SAFETY
      const started = performance.now()
      fc.sample(arbitrary, { numRuns: PROBE_DRAWS, seed })
      const measured = performance.now() - started
      return freshBudget >= measured * BUDGET_LOWER_FACTOR && freshBudget <= measured * BUDGET_UPPER_FACTOR
    },
    { fastCheck: { numRuns: PROBE_RUNS } },
  )
}
