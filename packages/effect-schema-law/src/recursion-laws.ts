import { it } from '@effect/vitest'
import { Schema as S, SchemaAST } from 'effect'
import { FastCheck as fc } from 'effect/testing'

const SAMPLE_DRAWS = 2000
const SAMPLE_SEEDS = 3

const STOCK_MAX_DEPTH = 2

const DEEP_DEPTH = STOCK_MAX_DEPTH + 2

const CALIBRATION_DRAWS = 2048
const CALIBRATION_RUNS = 5
const SAFETY = 256
const BACKSTOP_FACTOR = 2
const BUDGET_LOWER_FACTOR = 64
const BUDGET_UPPER_FACTOR = 1024
const CALIBRATION_SEED = 0xC0FFEE

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

const maxDepthOf = (ast: SchemaAST.AST): number => {
  const hook: unknown = SchemaAST.resolve(ast)?.['toArbitrary']
  if ((typeof hook !== 'object' && typeof hook !== 'function') || hook === null) return STOCK_MAX_DEPTH
  if (!('budget' in hook)) return STOCK_MAX_DEPTH
  const budget: unknown = hook['budget']
  if (typeof budget !== 'object' || budget === null || !('maxDepth' in budget)) return STOCK_MAX_DEPTH
  const maxDepth: unknown = budget['maxDepth']
  return typeof maxDepth === 'number' ? maxDepth : STOCK_MAX_DEPTH
}

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

const childAstsOf = (
  ast: SchemaAST.AST,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): ReadonlyArray<SchemaAST.AST> => {
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

const isRecursiveUnion = (
  union: SchemaAST.Union,
  resolved: Map<SchemaAST.Suspend, SchemaAST.AST>,
): boolean => {
  const seen = new Set<SchemaAST.AST>()
  const reaches = (ast: SchemaAST.AST): boolean => {
    if (ast === union) return true
    if (seen.has(ast)) return false
    seen.add(ast)
    return childAstsOf(ast, resolved).some((child) => reaches(child))
  }
  return union.types.some((member) => reaches(member))
}

const firstRecursiveUnion = (ast: SchemaAST.AST): SchemaAST.Union | undefined => {
  const resolved = new Map<SchemaAST.Suspend, SchemaAST.AST>()
  const seen = new Set<SchemaAST.AST>()
  const visit = (node: SchemaAST.AST): SchemaAST.Union | undefined => {
    if (seen.has(node)) return undefined
    seen.add(node)
    if (SchemaAST.isUnion(node) && isRecursiveUnion(node, resolved)) return node
    for (const child of childAstsOf(node, resolved)) {
      const found = visit(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  return visit(ast)
}

const memberSchemaOf = (ast: SchemaAST.AST): S.Top => S.make<S.Top>(ast)

const maxNestingDepthOf = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((deepest: number, element) => Math.max(deepest, maxNestingDepthOf(element)), 0)
  }
  if (typeof value === 'object' && value !== null) {
    return 1 + Object.values(value).reduce((deepest: number, child) => Math.max(deepest, maxNestingDepthOf(child)), 0)
  }
  return 0
}

const sampledAt = (arbitrary: fc.Arbitrary<unknown>, seed: number): ReadonlyArray<unknown> =>
  fc.sample(arbitrary, { numRuns: SAMPLE_DRAWS, seed })

const deepShareOf = (sample: ReadonlyArray<unknown>): number =>
  sample.filter((value) => maxNestingDepthOf(value) >= DEEP_DEPTH).length / sample.length

const coversEveryVariant = (sample: ReadonlyArray<unknown>, members: ReadonlyArray<S.Top>): boolean =>
  members.every((member) => sample.some((value) => S.is(member)(value)))

export const recursionLaws = <A, I>(label: string, schema: S.Codec<A, I>): void => {
  const union = firstRecursiveUnion(schema.ast)
  const rootIsTheRecursiveUnion = schema.ast === union
  if (union === undefined || !rootIsTheRecursiveUnion) return
  const arbitrary = S.toArbitrary(schema)(fc)
  const members = union.types.map(memberSchemaOf)
  const maxDepth = maxDepthOf(union)

  it.prop(
    `∀x_${label}Nesting_≤MaxDepth1`,
    [arbitrary],
    ([value]) => maxNestingDepthOf(value) <= maxDepth + 1,
  )

  it.prop(
    `∀s_${label}DeepShare_≠Zero`,
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareOf(sampledAt(arbitrary, seed)) > 0 && maxDepth > STOCK_MAX_DEPTH,
    lawOptionsFor(arbitrary),
  )

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
  const { terminatingRecursion } = await import('@systemfsoftware/effect-schema-recursion-budget')
  type Codec = S.Codec<unknown, unknown>
  type MemberTuple = readonly [Codec, Codec, Codec, Codec]

  const MAX_DEPTH = 6
  const NESTING_CAP = MAX_DEPTH + 1
  const BUDGET_PROBE_RUNS = 3
  const DeepChain = S.Int.pipe(S.check(S.isBetween({ minimum: NESTING_CAP + 1, maximum: NESTING_CAP + 20 })))

  const Lit = S.TaggedStruct('Lit', { value: S.Finite })
  const Id = S.TaggedStruct('Id', { name: S.String })
  const BasePair = [Lit, Id] as const

  const expressionOf = (build: (recur: MemberTuple) => Codec): Codec => {
    const Binary: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Binary'), left: Expr, right: Expr }))
    const Member: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Member'), object: Expr, property: Expr }))
    const Conditional: Codec = S.suspend((): Codec =>
      S.Struct({ _tag: S.Literal('Conditional'), test: Expr, consequent: Expr, alternate: Expr })
    )
    const Call: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Call'), callee: Expr, args: S.Array(Expr) }))
    const Expr: Codec = build([Binary, Member, Conditional, Call])
    return Expr
  }

  const ANNOTATED_EXPR = expressionOf((recur) =>
    terminatingRecursion({
      identifier: 'LawExpr',
      base: BasePair,
      recur,
      maxDepth: MAX_DEPTH,
      depthSize: 'medium',
    })
  )
  const STOCK_EXPR: Codec = expressionOf((recur) => S.Union([...BasePair, ...recur]))

  const basePairOnly: S.Annotations.ToArbitrary.Declaration<unknown, readonly []> = () => (fc) =>
    fc.oneof(S.toArbitrary(Lit)(fc), S.toArbitrary(Id)(fc))

  const DROPPED_MEMBER_EXPR = expressionOf((recur) =>
    S.Union([...BasePair, ...recur]).annotate({
      identifier: 'DroppedMemberExpr',
      toArbitrary: basePairOnly,
    })
  )

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
    return union === undefined ? [] : union.types.map(memberSchemaOf)
  }

  const coversAt = (schema: S.Constraint, seed: number): boolean =>
    coversEveryVariant(sampledAt(arbitraryOf(schema), seed), declaredMembersOf(schema))

  const longestNestingAt = (schema: S.Constraint, seed: number): number =>
    sampledAt(arbitraryOf(schema), seed).reduce(
      (deepest: number, value) => Math.max(deepest, maxNestingDepthOf(value)),
      0,
    )

  const declaredCapOf = (schema: S.Constraint): number => {
    const union = firstRecursiveUnion(schema.ast)
    return union === undefined ? 0 : maxDepthOf(union) + 1
  }

  const interruptedUnder = (limitMs: number, seed: number): boolean => {
    const details = fc.check(
      fc.property(arbitraryOf(ANNOTATED_EXPR), (value) => {
        sampledAt(arbitraryOf(ANNOTATED_EXPR), seed)
        return maxNestingDepthOf(value) <= NESTING_CAP
      }),
      { numRuns: BUDGET_PROBE_RUNS, seed, interruptAfterTimeLimit: limitMs, markInterruptAsFailure: true },
    )
    return details.failed && 'interrupted' in details && details.interrupted
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
    return Exit.isSuccess(decoded) ? maxNestingDepthOf(decoded.value) : -1
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
    '∀s_StockExprDeepShare_≠Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(STOCK_EXPR, seed) > 0,
    lawOptionsFor(arbitraryOf(STOCK_EXPR)),
  )

  it.prop(
    '∀s_DeclaredDeepShare_≠Zero',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(ANNOTATED_EXPR, seed) > 0,
    lawOptionsFor(arbitraryOf(ANNOTATED_EXPR)),
  )

  const BASE_HEAVY_EXPR = expressionOf((recur) =>
    terminatingRecursion({
      identifier: 'BaseHeavyExpr',
      base: [
        ...BasePair,
        S.TaggedStruct('Num', { value: S.Finite }),
        S.TaggedStruct('Str', { value: S.String }),
        S.TaggedStruct('Flag', { on: S.Boolean }),
      ],
      recur,
      maxDepth: MAX_DEPTH,
      depthSize: 'medium',
    })
  )

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
      fc.sample(arbitrary, { numRuns: BUDGET_PROBE_RUNS * SAMPLE_DRAWS, seed })
      const workMs = performance.now() - started
      return interruptedUnder(workMs / 4, seed) && !interruptedUnder(workMs * 4, seed)
    },
    { fastCheck: { numRuns: BUDGET_PROBE_RUNS } },
  )

  it.prop(
    '∀c_Budget_∈MeasuredBand',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => {
      const arbitrary = arbitraryOf(ANNOTATED_EXPR)
      const freshBudget = measureDrawMs(arbitrary) * ((SAMPLE_DRAWS * SAMPLE_SEEDS) / CALIBRATION_DRAWS) * SAFETY
      const started = performance.now()
      fc.sample(arbitrary, { numRuns: SAMPLE_DRAWS * SAMPLE_SEEDS, seed })
      const measured = performance.now() - started
      return freshBudget >= measured * BUDGET_LOWER_FACTOR && freshBudget <= measured * BUDGET_UPPER_FACTOR
    },
    { fastCheck: { numRuns: BUDGET_PROBE_RUNS } },
  )
}
