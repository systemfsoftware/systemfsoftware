import { Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from '../supervisor-dynamic.kernel.js'
import { failedIndexAddressesAChild } from './restart-decision.kernel.js'

export const RestartStrategy = Schema.Literals(['one_for_one', 'one_for_all', 'rest_for_one'])
export type RestartStrategy = typeof RestartStrategy.Type

export const DecideInput = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING }))),
  failedIndex: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MAX_CHILDREN_CEILING }))),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(
  Schema.check(Schema.makeFilter(failedIndexAddressesAChild, { message: 'failedIndex must be < totalChildren' })),
)
export type DecideInput = typeof DecideInput.Type

/** The filter's message, named at. */
const BOUND_MESSAGE = 'failedIndex must be < totalChildren'
const OVERSHOOT = 8

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  const { Exit, Option, Result } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  const { RestartDecisionRestart } = await import('./restart-decision.workflow.js')

  const decodeOf = (input: unknown) => Schema.decodeUnknownResult(DecideInput)(input)

  const messageOf = (input: unknown): string =>
    Result.match(decodeOf(input), { onFailure: (error) => error.message, onSuccess: () => '' })

  const sampleOf = (seed: number): DecideInput => {
    const [sampled] = fc.sample(Schema.toArbitrary(DecideInput)(fc), { seed, numRuns: 1 })
    return Option.getOrThrowWith(Option.fromNullishOr(sampled), () => new Error('fast-check returned no sample'))
  }

  const widthPastCap = fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: MAX_CHILDREN_CEILING + 1, max: MAX_CHILDREN_CEILING + 500 }),
    failedIndex: fc.constant(0),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  })

  it.prop(
    '∀d_SampledInput_∈DeclaredBounds',
    [Schema.toArbitrary(DecideInput)(fc)],
    ([input]) =>
      input.failedIndex >= 0 &&
      input.failedIndex < input.totalChildren &&
      input.totalChildren <= MAX_CHILDREN_CEILING,
  )

  it.prop('∀g_IndexAtOrPastWidth_=Left', [fc.integer()], ([seed]) => {
    const sampled = sampleOf(seed)
    const [failedIndex] = fc.sample(
      fc.integer({
        min: sampled.totalChildren,
        max: Math.min(sampled.totalChildren + OVERSHOOT, MAX_CHILDREN_CEILING),
      }),
      { seed, numRuns: 1 },
    )
    return Result.isFailure(decodeOf({ ...sampled, failedIndex }))
  })

  it.prop('∀g_IndexAtOrPastWidth_⊇BoundMessage', [fc.integer()], ([seed]) => {
    const sampled = sampleOf(seed)
    const [failedIndex] = fc.sample(
      fc.integer({
        min: sampled.totalChildren,
        max: Math.min(sampled.totalChildren + OVERSHOOT, MAX_CHILDREN_CEILING),
      }),
      { seed, numRuns: 1 },
    )
    return messageOf({ ...sampled, failedIndex }).includes(BOUND_MESSAGE)
  })

  it.prop('∀g_WidthPastEnforcedCap_=Left', [fc.integer()], ([seed]) => {
    const sampled = sampleOf(seed)
    const [totalChildren] = fc.sample(
      fc.integer({ min: MAX_CHILDREN_CEILING + 1, max: MAX_CHILDREN_CEILING + OVERSHOOT }),
      { seed, numRuns: 1 },
    )
    return Result.isFailure(decodeOf({ ...sampled, totalChildren }))
  })

  // The non-empty and integer constraints share one array node under v4, so an
  // empty array is a refusal no single-check weakening explains; the non-integer
  // class does discriminate, and the empty class is asserted as a refusal below.
  refutes(RestartDecisionRestart, {
    IndicesNonInteger: fc.constant({ _tag: 'Restart', indices: [1.5] }),
  })

  it.prop(
    '∀r_IndicesEmpty_⊥',
    [fc.constant({ _tag: 'Restart', indices: [] })],
    ([input]) => Exit.isFailure(Schema.decodeUnknownExit(RestartDecisionRestart)(input)),
  )

  // An over-cap width fails the integer/bound node, so it cannot discriminate
  // under v8's per-node weakening; it is still a refusal contract.
  it.prop(
    '∀d_WidthPastCap_⊥',
    [widthPastCap],
    ([input]) => Exit.isFailure(Schema.decodeUnknownExit(DecideInput)(input)),
  )

  refutes(DecideInput, {
    DecideIndexPastWidth: fc.record({
      strategy: fc.constantFrom('one_for_one'),
      totalChildren: fc.integer({ min: 1, max: 100 }),
      failedIndex: fc.integer({ min: 0, max: 99 }),
      exitSuccess: fc.boolean(),
      intensityExceeded: fc.boolean(),
    }).map((d) => ({ ...d, failedIndex: d.totalChildren + (d.failedIndex % 5) })),
    DecideWidthNonInteger: fc.record({
      strategy: fc.constantFrom('one_for_one'),
      totalChildren: fc.integer({ min: 1, max: 98 }).map((n) => n + 0.5),
      failedIndex: fc.constant(0),
      exitSuccess: fc.boolean(),
      intensityExceeded: fc.boolean(),
    }),
    DecideIndexNonInteger: fc.integer({ min: 2, max: 100 }).chain((totalChildren) =>
      fc.record({
        strategy: fc.constantFrom('one_for_one'),
        totalChildren: fc.constant(totalChildren),
        failedIndex: fc.integer({ min: 0, max: totalChildren - 1 }).map((n) => n + 0.5),
        exitSuccess: fc.boolean(),
        intensityExceeded: fc.boolean(),
      })
    ),
  })

  // A negative failedIndex shares the integer/bound node, so it cannot discriminate
  // under v8's per-node weakening; it is still a refusal contract.
  it.prop('∀d_IndexNegative_⊥', [fc.record({
    strategy: fc.constantFrom('one_for_one'),
    totalChildren: fc.integer({ min: 1, max: 100 }),
    failedIndex: fc.integer({ min: -100, max: -1 }),
    exitSuccess: fc.boolean(),
    intensityExceeded: fc.boolean(),
  })], ([input]) => Exit.isFailure(Schema.decodeUnknownExit(DecideInput)(input)))
}
