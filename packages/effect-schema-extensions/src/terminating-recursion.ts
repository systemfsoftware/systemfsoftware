/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'
import type { FastCheck } from 'effect/testing'

/**
 * The recursion budget an annotated union declares, carried on the derivation
 * hook so `@systemfsoftware/effect-schema-law` can read the same ceiling the
 * generator was built with, without importing this package.
 */
export interface TerminatingRecursionBudget {
  readonly identifier: string
  readonly maxDepth: number
  readonly depthSize: 'small' | 'medium' | 'large'
}

/**
 * The derivation hook the union carries, with the budget it was built from.
 */
export interface TerminatingRecursionHook {
  (
    typeParameters: readonly [],
  ): (fc: typeof FastCheck, context: S.Annotations.ToArbitrary.Context) => S.Annotations.ToArbitrary.Output<unknown>
  readonly budget: TerminatingRecursionBudget
}

/**
 * The declared budget and the members it spans. `identifier` keys the cycle's
 * budget — two cycles sharing it share one budget, so give each cycle its own.
 */
export interface TerminatingRecursionOptions<
  Base extends readonly [S.Constraint, ...ReadonlyArray<S.Constraint>] = readonly [
    S.Constraint,
    ...ReadonlyArray<S.Constraint>,
  ],
  Recur extends readonly [S.Constraint, ...ReadonlyArray<S.Constraint>] = readonly [
    S.Constraint,
    ...ReadonlyArray<S.Constraint>,
  ],
> {
  readonly identifier: string
  readonly base: Base
  readonly recur: Recur
  readonly maxDepth: number
  readonly depthSize: 'small' | 'medium' | 'large'
}

/** The declared ceiling: a value's deepest generated nesting is this bound. */
const MEMBER_LEVELS_PER_DESCENT = 1

const recursionHookOf = (options: TerminatingRecursionOptions): TerminatingRecursionHook => {
  const { base, depthSize, identifier, maxDepth, recur } = options
  let memberDerivationInFlight = false

  return Object.assign(
    (): (
      fc: typeof FastCheck,
      context: S.Annotations.ToArbitrary.Context,
    ) => S.Annotations.ToArbitrary.Output<unknown> =>
    (fc) => {
      const baseArbitrary = fc.oneof(...base.map((member) => S.toArbitrary(member)(fc)))
      if (memberDerivationInFlight) return baseArbitrary
      memberDerivationInFlight = true
      try {
        return {
          arbitrary: fc.oneof(
            { depthIdentifier: identifier, maxDepth, depthSize },
            ...base.map((member) => S.toArbitrary(member)(fc)),
            ...recur.map((member) => S.toArbitrary(member)(fc)),
          ),
          terminal: baseArbitrary,
        }
      } finally {
        memberDerivationInFlight = false
      }
    },
    { budget: { identifier, maxDepth, depthSize } },
  )
}

/**
 * The deepest chain of generated member objects. Arrays are traversed in place:
 * a budget step produces exactly one member object, and an array wrapper inside
 * a member consumes none of the budget.
 */
const maxNestingDepthOf = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((deepest: number, element) => Math.max(deepest, maxNestingDepthOf(element)), 0)
  }
  if (typeof value === 'object' && value !== null) {
    return MEMBER_LEVELS_PER_DESCENT +
      Object.values(value).reduce((deepest: number, child) => Math.max(deepest, maxNestingDepthOf(child)), 0)
  }
  return 0
}

export const terminatingRecursion = <
  const Base extends readonly [S.Constraint, ...ReadonlyArray<S.Constraint>],
  const Recur extends readonly [S.Constraint, ...ReadonlyArray<S.Constraint>],
>(
  options: TerminatingRecursionOptions<Base, Recur>,
) =>
  S.Union([...options.base, ...options.recur]).annotate({
    identifier: options.identifier,
    toArbitrary: recursionHookOf(options),
  })

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and the runner never enters the published
  // module graph. A static import would ship the test runner.
  const { it } = await import('@effect/vitest')
  const { Exit, Schema: S } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  type Codec = S.Codec<unknown, unknown>

  /** The declared defaults the deep-reachability floor is measured under. */
  const MAX_DEPTH = 6
  const NESTING_CAP = MAX_DEPTH + 1
  const DEEP_DEPTH = 4
  const DEEP_SHARE = 0.15
  const SAMPLE_DRAWS = 2000
  const SAMPLE_SEEDS = 3
  const SHARING_DRAWS = 20_000
  const SAMPLE_BUDGET_MS = 10_000
  const SAMPLE_TIMEOUT_MS = 30_000

  const SAMPLE_OPTIONS = {
    timeout: SAMPLE_TIMEOUT_MS,
    fastCheck: { numRuns: SAMPLE_SEEDS, interruptAfterTimeLimit: SAMPLE_BUDGET_MS, markInterruptAsFailure: true },
  } as const

  const Lit = S.TaggedStruct('Lit', { value: S.Finite })
  const Id = S.TaggedStruct('Id', { name: S.String })
  const Binary: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Binary'), left: Expr, right: Expr }))
  const Member: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Member'), object: Expr, property: Expr }))
  const Conditional: Codec = S.suspend((): Codec =>
    S.Struct({ _tag: S.Literal('Conditional'), test: Expr, consequent: Expr, alternate: Expr })
  )
  const Call: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Call'), callee: Expr, args: S.Array(Expr) }))
  const Expr = terminatingRecursion({
    identifier: 'Expr',
    base: [Lit, Id],
    recur: [Binary, Member, Conditional, Call],
    maxDepth: MAX_DEPTH,
    depthSize: 'medium',
  })

  const VARIANT_MEMBERS = [Lit, Id, Binary, Member, Conditional, Call] as const

  const sampleOf = (schema: S.Constraint, seed: number, draws: number): ReadonlyArray<unknown> =>
    fc.sample(S.toArbitrary(schema)(fc), { numRuns: draws, seed })

  const deepShareAt = (seed: number): number => {
    const sample = sampleOf(Expr, seed, SAMPLE_DRAWS)
    return sample.filter((value) => maxNestingDepthOf(value) >= DEEP_DEPTH).length / sample.length
  }

  const coversEveryVariant = (seed: number): boolean => {
    const sample = sampleOf(Expr, seed, SAMPLE_DRAWS)
    return VARIANT_MEMBERS.every((member) => sample.some((value) => S.is(member)(value)))
  }

  const deepestNestingAt = (schema: S.Constraint, seed: number, draws: number): number =>
    sampleOf(schema, seed, draws).reduce(
      (deepest: number, value) => Math.max(deepest, maxNestingDepthOf(value)),
      0,
    )

  const nestedCycles = (outerIdentifier: string, innerIdentifier: string): S.Constraint => {
    const Wrap: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Wrap'), inner: Inner }))
    const Inner = terminatingRecursion({
      identifier: innerIdentifier,
      base: [Lit],
      recur: [Wrap],
      maxDepth: MAX_DEPTH,
      depthSize: 'medium',
    })
    const Pair: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Pair'), left: Outer, right: Inner }))
    const Fst: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Fst'), inner: Inner, other: Inner }))
    const Snd: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Snd'), first: Outer, second: Outer }))
    const Outer = terminatingRecursion({
      identifier: outerIdentifier,
      base: [Lit],
      recur: [Pair, Fst, Snd],
      maxDepth: MAX_DEPTH,
      depthSize: 'medium',
    })
    return Outer
  }

  const SHARED_BUDGET_CYCLE = nestedCycles('SharedCycle', 'SharedCycle')
  const SEPARATE_BUDGET_CYCLE = nestedCycles('OuterCycle', 'InnerCycle')

  const DeepChain = S.Int.pipe(
    S.check(S.isBetween({ minimum: NESTING_CAP + 1, maximum: NESTING_CAP + 20 })),
  )

  const encodedChainOf = (depth: number): unknown => {
    let node: unknown = { _tag: 'Lit', value: 1 }
    for (let level = 1; level < depth; level += 1) {
      node = { _tag: 'Call', callee: node, args: [] }
    }
    return node
  }

  const decodedDepthOf = (depth: number): number => {
    const decoded = S.decodeUnknownExit(Expr)(encodedChainOf(depth))
    return Exit.isSuccess(decoded) ? maxNestingDepthOf(decoded.value) : -1
  }

  const SelfMember: Codec = S.suspend((): Codec => S.Struct({ _tag: S.Literal('Self'), inner: SelfCycle }))
  const SelfCycle = S.Union([Lit, SelfMember]).annotate({
    identifier: 'SelfCycle',
    toArbitrary: recursionHookOf({
      identifier: 'SelfCycle',
      base: [Lit],
      recur: [SelfMember],
      maxDepth: MAX_DEPTH,
      depthSize: 'medium',
    }),
  })

  it.prop('∀e_ExprNesting_≤MaxDepth1', [S.toArbitrary(Expr)(fc)], ([expr]) => maxNestingDepthOf(expr) <= NESTING_CAP)

  it.prop(
    '∀s_ExprDeepShare_≥DeepFloor',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => deepShareAt(seed) >= DEEP_SHARE,
    SAMPLE_OPTIONS,
  )

  it.prop(
    '∀s_ExprVariants_⊇AllDeclared',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) => coversEveryVariant(seed),
    SAMPLE_OPTIONS,
  )

  it.prop('∀d_ChainPastCap_=Depth', [S.toArbitrary(DeepChain)(fc)], ([depth]) => decodedDepthOf(depth) === depth)

  it.prop(
    '∀s_SharedCycleDepth_≤MaxDepth1',
    [S.toArbitrary(S.Int)(fc)],
    ([seed]) =>
      deepestNestingAt(SHARED_BUDGET_CYCLE, seed, SHARING_DRAWS) <= NESTING_CAP &&
      deepestNestingAt(SEPARATE_BUDGET_CYCLE, seed, SHARING_DRAWS) > NESTING_CAP,
    SAMPLE_OPTIONS,
  )

  it.prop(
    '∀e_SelfMemberNesting_≤MaxDepth1',
    [S.toArbitrary(SelfCycle)(fc)],
    ([self]) => maxNestingDepthOf(self) <= NESTING_CAP,
  )
}
