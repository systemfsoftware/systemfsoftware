/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'

/**
 * Default recursion cap, counted in descents below the root.
 *
 * Single source for the `maxDepth` option default and for the sampling `size`
 * the in-source properties pass alongside it: native Arbitrary derives
 * generation from the schema and terminates recursion through its own shared
 * budget, so depth is a sampling parameter (`CheckOptions.size` /
 * `SampleOptions.size`), not a schema-side `oneof` budget. The cap is
 * therefore enforced where values are drawn — never where they are decoded,
 * encoded, or compared (BU-R1).
 */
const DEFAULT_MAX_DEPTH = 2

/**
 * A `Schema.Union` of non-recursive `base` members and recursive `recur`
 * members whose *generated* values terminate.
 *
 * Returns `S.Union([...base, ...recur])` annotated with `identifier`, so
 * decode, encode, and equivalence stay exactly `Schema.Union`'s and accept
 * values nested deeper than the cap (BU-R1). To reproduce the cap while
 * sampling, pass the same `maxDepth` as `size` to `it.prop`'s `arbitrary`
 * options or to `Arbitrary.sampleEffect` — the in-source properties below do
 * exactly this with the default.
 */
export const boundedUnion = <
  Base extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
  Recur extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
>(
  identifier: string,
  options: {
    readonly base: Base
    readonly recur: Recur
    /**
     * Descends below the root allowed when sampling. This is the sampling
     * contract, not a decode filter: draw generation with `size: maxDepth`
     * (see `DEFAULT_MAX_DEPTH`), while decode accepts any depth.
     */
    readonly maxDepth?: number
  },
): S.Codec<
  Base[number]['Type'] | Recur[number]['Type'],
  Base[number]['Encoded'] | Recur[number]['Encoded']
> => {
  const { base, recur } = options
  return S.Union([...base, ...recur]).annotate({ identifier })
}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { Effect, Exit, Match } = await import('effect')
  const { Schema: S } = await import('effect')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

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
   * `nestingDepth` scores a leaf 1, so `DEFAULT_MAX_DEPTH` descents below the
   * root top out one above it: recurse -> recurse -> leaf for the default 2.
   */
  const DEPTH_CAP = DEFAULT_MAX_DEPTH + 1

  /**
   * At the root the native engine draws uniformly among the six eligible
   * members, so the rarest tag sits near 1/6 and 200 draws miss a given tag
   * with probability (5/6)^200 ≈ 2e-16. The number to hold is this one, not a
   * seed: each sampling property below draws one batch per generated seed, so
   * a batch that rarely misses still reds the run when it does.
   */
  const SAMPLE_SIZE = 200

  /**
   * Each sampling property draws `SAMPLE_SIZE` values per generated seed from
   * a recursive schema, which is CPU-bound and does not share a core well.
   * The timeout has to cover the contended cost, because a bound set near the
   * isolated cost hands the verdict to whichever sibling tasks happen to run
   * alongside, and a red from that is indistinguishable from a real one.
   */
  const SAMPLE_TIMEOUT_MS = 120_000

  const VARIANT_COUNT = BASE.length + RECUR.length

  /**
   * Native `generateUnion` selects uniformly among the budget-eligible
   * members, so each of the six tags — the base pair counting as two members,
   * not one branch — is expected at `1 / VARIANT_COUNT`. For a 200-draw batch
   * the per-tag standard deviation is about 0.026, so the tolerance sits near
   * six sigma and a false red lands near 1e-8 per batch.
   */
  const EVEN_TAG_SHARE = 1 / VARIANT_COUNT
  const SHARE_TOLERANCE = 0.15

  const ExprArbitrary = Arbitrary.schema(Expr)

  /**
   * One capped batch: `size` is the sampling-side image of `maxDepth`, so
   * every sampled tree nests no deeper than `DEPTH_CAP` while decode stays
   * uncapped (BU-R1). A sampling exhaustion stays on the failure channel, so
   * a starved batch reds the property instead of passing quietly.
   */
  const sampleAt = (seed: number) =>
    Arbitrary.sampleEffect(ExprArbitrary, { count: SAMPLE_SIZE, size: DEFAULT_MAX_DEPTH, seed })

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

  /**
   * Tags are tallied per member: a tag that never drew at all scores maximal
   * drift rather than being skipped, so a starved member cannot hide by being
   * absent from the tally. Counting against the fixture's own arity means a
   * seventh variant raises the bar without this helper being touched.
   */
  const widestTagDriftOf = (samples: readonly Expr[]): number => {
    const drawn: Record<string, number> = {}
    for (const sample of samples) {
      const tag = tagOf(sample)
      drawn[tag] = (drawn[tag] ?? 0) + 1
    }
    const tallies = Object.values(drawn)
    if (tallies.length !== VARIANT_COUNT) return 1
    let widest = 0
    for (const count of tallies) {
      const drift = Math.abs(count / samples.length - EVEN_TAG_SHARE)
      if (drift > widest) widest = drift
    }
    return widest
  }

  /**
   * The cap lives in the sampling `size`, not in the schema: drawing the same
   * union with a larger size lets a chain run past `DEPTH_CAP`. Quantified
   * over `Expr` itself, so the engine's own bias and shrinking hunt the deep
   * cases rather than a seed deciding whether one appears.
   */
  it.prop('∀e_ExprNesting_≤DepthCap', [Expr], ([expr]) => nestingDepth(expr) <= DEPTH_CAP, {
    arbitrary: { size: DEFAULT_MAX_DEPTH },
  })

  /**
   * The cap must bind rather than the generator simply never recursing: a kernel
   * that lost its recurse members, or capped a level short, still satisfies the
   * bound above while generating nothing but shallow values.
   */
  it.effect.prop(
    '∀s_ExprDeepest_=DepthCap',
    [S.Int],
    ([seed]) => Effect.map(sampleAt(seed), (samples) => deepestOf(samples) === DEPTH_CAP),
    { timeout: SAMPLE_TIMEOUT_MS },
  )

  /**
   * Every declared variant is reachable. This is the base/recur split's own
   * contract: mixing the base members in at each level is what `boundedUnion`
   * exists to do, and folding a member into the wrong list — or dropping it from
   * the `S.Union` the annotation rides on — makes one tag unreachable. Counting
   * distinct tags against the fixture's own arity means a seventh variant raises
   * the bar without this test being touched.
   */
  it.effect.prop(
    '∀s_ExprComposition_⊇AllTags',
    [S.Int],
    ([seed]) => Effect.map(sampleAt(seed), (samples) => distinctTagsOf(samples) === VARIANT_COUNT),
    { timeout: SAMPLE_TIMEOUT_MS },
  )

  /**
   * The mix stays even. This is the only property here that a *reweighting*
   * breaks: starving recursion, or over-weighting the base pair, leaves every
   * tag reachable and the depth cap intact, so the three properties above stay
   * green while generation quietly collapses toward leaves — and every consumer
   * that draws your schema through `ruleOfSchemas` starts exercising shallow
   * values only.
   */
  it.effect.prop(
    '∀s_ExprTags_≤ShareTolerance',
    [S.Int],
    ([seed]) => Effect.map(sampleAt(seed), (samples) => widestTagDriftOf(samples) <= SHARE_TOLERANCE),
    { timeout: SAMPLE_TIMEOUT_MS },
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

  const DeeperDepth = S.Int.check(S.isBetween({ minimum: DEPTH_CAP + 1, maximum: DEPTH_CAP + 20 }))

  it.prop(
    '∀d_DeeperThanCap_=Depth',
    [DeeperDepth],
    ([depth]) => {
      const decoded = S.decodeUnknownExit(Expr)(encodedChain(depth))
      return Exit.isSuccess(decoded) && nestingDepth(decoded.value) === depth
    },
  )
  it.prop('∀e_ExprSample_≡RoundTrip', [Expr], ([expr]) => {
    const encoded = S.encodeUnknownExit(Expr)(expr)
    if (Exit.isFailure(encoded)) return false
    const decoded = S.decodeUnknownExit(Expr)(encoded.value)
    return Exit.isSuccess(decoded) && tagOf(decoded.value) === tagOf(expr)
  })
}
