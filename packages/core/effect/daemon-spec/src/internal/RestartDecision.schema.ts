import { Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from '../SupervisorDynamic.js'

/** @internal */
export const RestartStrategy = Schema.Literals(['one_for_one', 'one_for_all', 'rest_for_one'])
/** @internal */
export type RestartStrategy = typeof RestartStrategy.Type

/**
 * The cross-field invariant the command carries: a failed child's index addresses one of
 * the children that exist.
 *
 * It is a named function rather than an inline `Schema.filter` arrow because naming it makes
 * it reachable by this file's property block, which an inline arrow is not. It is not
 * exported: a `*.schema.ts` declares schemas and the vocabulary they are built from, never
 * loose functions, and nothing outside this module needs it.
 *
 * It lives here rather than beside the decision because the decision now imports
 * `DecideInput` as a *value* — `Workflow.make` constrains its command argument on the class
 * itself — so the dependency between these two modules has to run one way only. With the
 * predicate on the other side, both load orders reach a temporal dead zone: whichever module
 * evaluates first suspends on the other, and the name it needs at module scope is not yet
 * initialised.
 */
const failedIndexAddressesAChild = (input: {
  readonly failedIndex: number
  readonly totalChildren: number
}): boolean => input.failedIndex < input.totalChildren

/**
 * The message the cross-field filter reports. One binding, referenced by the filter and
 * by the law that asserts on it: a second copy would let the law pass against a message
 * the schema no longer produces, which is the whole failure the law exists to catch.
 */
const BOUND_MESSAGE = 'failedIndex must be < totalChildren'

/**
 * The command's field map and cross-field check, named so the class below extends a binding
 * rather than an inline factory call. An anonymous base adds a new `ae-forgotten-export`
 * `*_base` warning to the committed API report, which this package fixes at the source
 * instead of suppressing.
 */
const DecideInputBase = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING }))),
  failedIndex: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MAX_CHILDREN_CEILING }))),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(
  Schema.check(Schema.makeFilter(failedIndexAddressesAChild, { message: BOUND_MESSAGE })),
)

/**
 * The restart command. A `Schema.Class` rather than a `Schema.Struct` because `Workflow.make`
 * takes the command's class as its first argument, and a struct carries no `identifier` and
 * no `extend` — the constraint refuses it. Every field schema and the cross-field check are
 * the ones the struct carried.
 */
/** @internal */
export class DecideInput extends Schema.Class<DecideInput>('DecideInput')(DecideInputBase) {}

const OVERSHOOT = 8

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { refutes } = await import('@systemfsoftware/effect-schema-refutation')
  const { Exit, Option, Result } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  const { RestartDecisionRestart } = await import('./RestartDecision.workflow.js')

  const decodeOf = (input: unknown) => Schema.decodeUnknownResult(DecideInput)(input)

  const messageOf = (input: unknown): string =>
    Result.match(decodeOf(input), { onFailure: (error) => error.message, onSuccess: () => '' })

  /**
   * A valid command as the plain record `decode` accepts, not as a decoded instance: the
   * three refusal properties below override one field of it, and spreading a class instance
   * to do that would drop its prototype. The shape is read off the named base rather than
   * restated.
   */
  const sampleOf = (seed: number): typeof DecideInputBase.Type => {
    const [sampled] = fc.sample(Schema.toArbitrary(DecideInput)(fc), { seed, numRuns: 1 })
    const command = Option.getOrThrowWith(
      Option.fromNullishOr(sampled),
      () => new Error('fast-check returned no sample'),
    )
    return {
      strategy: command.strategy,
      totalChildren: command.totalChildren,
      failedIndex: command.failedIndex,
      exitSuccess: command.exitSuccess,
      intensityExceeded: command.intensityExceeded,
    }
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
