/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'
import type { FastCheck } from 'effect/testing'

export const boundedUnion = <
  Base extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
  Recur extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
>(
  identifier: string,
  options: {
    readonly base: Base
    readonly recur: Recur
    readonly maxDepth?: number
  },
): S.Codec<
  Base[number]['Type'] | Recur[number]['Type'],
  Base[number]['Encoded'] | Recur[number]['Encoded']
> => {
  const { base, maxDepth = 2, recur } = options
  // The member arbitraries are derived inside the hook (not at construction):
  // a recursive union's members reference the union being built, so deriving
  // them eagerly would run the recursive thunks before the binding exists.
  // Deriving a recursive member re-enters this union's own arbitrary
  // derivation while it is still in flight — the guard folds that re-entry to
  // the finite base pair, so the single top-level derivation closes instead
  // of recursing forever. The recursion budget itself stays the classic
  // shared `depthIdentifier`/`maxDepth` oneof, which is what the depth law
  // measures.
  let deriving = false
  const hook: S.Annotations.ToArbitrary.Declaration<unknown, readonly []> = () =>
  (
    fc: typeof FastCheck,
    _context?: S.Annotations.ToArbitrary.Context,
  ): FastCheck.Arbitrary<unknown> | S.Annotations.ToArbitrary.Derivation<unknown> => {
    const baseArbitraries = fc.oneof(...base.map((member) => S.toArbitrary(member)(fc)))
    if (deriving) return baseArbitraries
    deriving = true
    try {
      const recurArbitraries = recur.map((member) => S.toArbitrary(member)(fc))
      return {
        arbitrary: fc.oneof(
          { depthIdentifier: identifier, maxDepth },
          baseArbitraries,
          ...recurArbitraries,
        ),
        terminal: baseArbitraries,
      }
    } finally {
      deriving = false
    }
  }
  return S.Union([...base, ...recur]).annotate({ identifier, toArbitrary: hook })
}

/** Seeds per sampling property. */
const SEEDS = 25

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { Exit, Match } = await import('effect')
  const { Schema: S } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * `ruleOfSchemas` covers a schema's codec laws; the arbitrary `boundedUnion`
   * annotates onto the union is covered here, and nowhere else. No seed is named
   * below — where a sample is unavoidable the seed is generated, so each property
   * is quantified over every seed rather than recorded at one.
   */

  /**
   * The recursive members keep hand-written anchors for their recursive fields:
   * deriving the whole type from its own schema const (`type Binary =
   * S.Schema.Type<typeof Binary>` with the const annotated `: S.Codec<Binary>`)
   * is circular (TS2502/TS2456), and leaving the const unannotated cannot be
   * inferred (TS7022).
   *
   * The tag is no part of that constraint. Each variant's non-recursive half is
   * its own `S.TaggedStruct`, which nothing recursive mentions and the type can
   * therefore derive from; only the self-referencing fields stay declared by
   * hand. So no `_tag` is written in a type position, and the runtime schema
   * spreads the base's fields rather than restating the tag.
   */
  const BinaryBase = S.TaggedStruct('Binary', { op: S.String })
  const MemberBase = S.TaggedStruct('Member', {})
  const ConditionalBase = S.TaggedStruct('Conditional', {})
  const CallBase = S.TaggedStruct('Call', {})

  type Binary = S.Schema.Type<typeof BinaryBase> & { readonly left: Expr; readonly right: Expr }
  type Member = S.Schema.Type<typeof MemberBase> & { readonly object: Expr; readonly property: Expr }
  type Conditional = S.Schema.Type<typeof ConditionalBase> & {
    readonly test: Expr
    readonly consequent: Expr
    readonly alternate: Expr
  }
  type Call = S.Schema.Type<typeof CallBase> & { readonly callee: Expr; readonly args: readonly Expr[] }

  type Expr = Lit | Id | Binary | Member | Conditional | Call

  const Lit = S.TaggedStruct('Lit', { value: S.Finite })
  const Id = S.TaggedStruct('Id', { name: S.String })

  const Binary: S.Codec<Binary> = S.suspend((): S.Codec<Binary> =>
    S.Struct({ ...BinaryBase.fields, left: Expr, right: Expr })
  )
  const Member: S.Codec<Member> = S.suspend((): S.Codec<Member> =>
    S.Struct({ ...MemberBase.fields, object: Expr, property: Expr })
  )
  const Conditional: S.Codec<Conditional> = S.suspend((): S.Codec<Conditional> =>
    S.Struct({ ...ConditionalBase.fields, test: Expr, consequent: Expr, alternate: Expr })
  )
  const Call: S.Codec<Call> = S.suspend((): S.Codec<Call> =>
    S.Struct({ ...CallBase.fields, callee: Expr, args: S.Array(Expr) })
  )

  const BASE = [Lit, Id] as const
  const RECUR = [Binary, Member, Conditional, Call] as const

  const Expr: S.Codec<Expr> = boundedUnion('Expr', { base: BASE, recur: RECUR })

  type Lit = S.Schema.Type<typeof Lit>
  type Id = S.Schema.Type<typeof Id>

  /**
   * The default `maxDepth` is 2, and depth counts recursive *descents*: a root
   * recurse may bear a recurse child, whose own children are forced to base. So the
   * deepest chain is recurse -> recurse -> leaf, and `nestingDepth` — which scores a
   * leaf 1 — tops out one above the cap.
   */
  const DEPTH_CAP = 3

  /**
   * At the root `fc.oneof` hands out five branches, the base pair counting as
   * one, so the rarest tag sits near 1/10 and 200 draws miss a given tag with
   * probability 0.9^200 ≈ 7e-10. The number to hold is this one, not a seed —
   * and the margin is thinner than it looks. Measured over 2000 seeds, a run of
   * 50 draws misses a tag 1.3% of the time, which `SEEDS` independent draws
   * compound into roughly one red in four per test run; the composition
   * property is only comfortably stable above about 100.
   */
  const SAMPLE_SIZE = 200

  /**
   * Each sampling property draws `SEEDS * SAMPLE_SIZE` values from a recursive
   * schema, which is CPU-bound and does not share a core well. Measured on the
   * same commit: 612ms for the file's slowest property run alone, 45.7s for the
   * same property inside a full parallel gate — a 74x spread. The timeout has to
   * cover the contended cost, because a bound set near the isolated cost hands
   * the verdict to whichever sibling tasks happen to run alongside, and a red
   * from that is indistinguishable from a real one.
   */
  const SAMPLE_TIMEOUT_MS = 120_000

  const VARIANT_COUNT = BASE.length + RECUR.length

  /**
   * The base pair enters each level as ONE branch of that level's `fc.oneof`,
   * so the root's branches — the base pair, then each recur member — are evenly
   * weighted at `1 / (1 + RECUR.length)`. Measured over 3000 seeds the widest
   * per-branch drift was 0.115; the tolerance sits above that at about 5.3
   * binomial standard deviations, putting a false red near 1e-7 per seed.
   */
  const EVEN_BRANCH_SHARE = 1 / (1 + RECUR.length)
  const SHARE_TOLERANCE = 0.15

  const sampleAt = (seed: number): readonly Expr[] => fc.sample(S.toArbitrary(Expr)(fc), { numRuns: SAMPLE_SIZE, seed })

  const tagOf = (expr: Expr): Expr['_tag'] =>
    Match.value(expr).pipe(
      Match.tag('Lit', () => 'Lit' as const),
      Match.tag('Id', () => 'Id' as const),
      Match.tag('Binary', () => 'Binary' as const),
      Match.tag('Member', () => 'Member' as const),
      Match.tag('Conditional', () => 'Conditional' as const),
      Match.tag('Call', () => 'Call' as const),
      Match.exhaustive,
    )

  const nestingDepth = (expr: Expr): number =>
    Match.value(expr).pipe(
      Match.tag('Lit', () => 1),
      Match.tag('Id', () => 1),
      Match.tag('Binary', ({ left, right }) => 1 + Math.max(nestingDepth(left), nestingDepth(right))),
      Match.tag(
        'Member',
        ({ object, property }) => 1 + Math.max(nestingDepth(object), nestingDepth(property)),
      ),
      Match.tag(
        'Conditional',
        ({ test, consequent, alternate }) =>
          1 + Math.max(nestingDepth(test), nestingDepth(consequent), nestingDepth(alternate)),
      ),
      Match.tag('Call', ({ callee, args }) => 1 + Math.max(nestingDepth(callee), ...args.map(nestingDepth))),
      Match.exhaustive,
    )

  const deepestOf = (samples: readonly Expr[]): number =>
    samples.reduce((deepest, sample) => Math.max(deepest, nestingDepth(sample)), 0)

  const distinctTagsOf = (samples: readonly Expr[]): number => {
    const tags = new Set<Expr['_tag']>()
    for (const sample of samples) tags.add(tagOf(sample))
    return tags.size
  }

  const isBaseTag = (tag: Expr['_tag']): boolean => tag === 'Lit' || tag === 'Id'

  /**
   * A branch is the base pair taken together, or one recurse member. A branch that
   * never drew at all scores maximal drift rather than being skipped, so a
   * starved branch cannot hide by being absent from the tally.
   */
  const widestBranchDriftOf = (samples: readonly Expr[]): number => {
    const drawn = new Map<string, number>()
    for (const sample of samples) {
      const tag = tagOf(sample)
      const branch = isBaseTag(tag) ? 'base' : tag
      drawn.set(branch, (drawn.get(branch) ?? 0) + 1)
    }
    if (drawn.size !== 1 + RECUR.length) return 1
    let widest = 0
    for (const count of drawn.values()) {
      const drift = Math.abs(count / samples.length - EVEN_BRANCH_SHARE)
      if (drift > widest) widest = drift
    }
    return widest
  }

  /**
   * Raising the default `maxDepth`, or dropping the `depthIdentifier` that makes
   * the cap shared rather than per-branch, lets a chain run past `DEPTH_CAP`.
   * Quantified over `Expr` itself, so fast-check's own bias and shrinking hunt
   * the deep cases rather than a seed deciding whether one appears.
   */
  it.prop('∀e_ExprNesting_≤DepthCap', [S.toArbitrary(Expr)(fc)], ([expr]) => nestingDepth(expr) <= DEPTH_CAP)

  /**
   * The cap must bind rather than the generator simply never recursing: a kernel
   * that lost its recurse members, or capped a level short, still satisfies the
   * bound above while generating nothing but shallow values.
   */
  it.prop(
    '∀s_ExprDeepest_=DepthCap',
    [fc.integer()],
    ([seed]) => deepestOf(sampleAt(seed)) === DEPTH_CAP,
    { timeout: SAMPLE_TIMEOUT_MS, fastCheck: { numRuns: SEEDS } },
  )

  /**
   * Every declared variant is reachable. This is the base/recur split's own
   * contract: mixing the base members in at each level is what `boundedUnion`
   * exists to do, and folding a member into the wrong list — or dropping it from
   * the `S.Union` the annotation rides on — makes one tag unreachable. Counting
   * distinct tags against the fixture's own arity means a seventh variant raises
   * the bar without this test being touched.
   */
  it.prop(
    '∀s_ExprComposition_⊇AllTags',
    [fc.integer()],
    ([seed]) => distinctTagsOf(sampleAt(seed)) === VARIANT_COUNT,
    { timeout: SAMPLE_TIMEOUT_MS, fastCheck: { numRuns: SEEDS } },
  )

  /**
   * The mix stays even. This is the only property here that a *reweighting*
   * breaks: starving recursion, or over-weighting the base pair, leaves every
   * tag reachable and the depth cap intact, so the three properties above stay
   * green while generation quietly collapses toward leaves — and every consumer
   * that draws your schema through `ruleOfSchemas` starts exercising shallow
   * values only.
   */
  it.prop(
    '∀s_ExprBranches_≤ShareTolerance',
    [fc.integer()],
    ([seed]) => widestBranchDriftOf(sampleAt(seed)) <= SHARE_TOLERANCE,
    { timeout: SAMPLE_TIMEOUT_MS, fastCheck: { numRuns: SEEDS } },
  )

  /**
   * The cap bounds generation and nothing else. Everything above draws values
   * *from* the schema, so every one of them is bounded by construction and all
   * four stay green if `maxDepth` leaks into decoding. This one builds input the
   * generator can never produce — a chain far deeper than `DEPTH_CAP` — and
   * requires the codec to accept it, which is the promise a runtime dependency
   * makes to a consumer decoding real input at a boundary.
   */
  const encodedChain = (depth: number): unknown =>
    depth <= 1
      ? { _tag: 'Lit', value: 1 }
      : { _tag: 'Binary', op: '+', left: encodedChain(depth - 1), right: { _tag: 'Lit', value: 1 } }

  it.prop(
    '∀d_DeeperThanCap_=Depth',
    [fc.integer({ min: DEPTH_CAP + 1, max: DEPTH_CAP + 20 })],
    ([depth]) => {
      const decoded = S.decodeUnknownExit(Expr)(encodedChain(depth))
      return Exit.isSuccess(decoded) && nestingDepth(decoded.value) === depth
    },
  )
}
