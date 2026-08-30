/// <reference types="vitest/import-meta" />
import { Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from './SupervisorDynamic.js'

/** @public */
export const IntensityConfig = Schema.Struct({
  restarts: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  window: Schema.Duration,
})
/** @public */
export type IntensityConfig = typeof IntensityConfig.Type

const IntensityTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/Intensity')
/** @public */
export type IntensityTypeId = typeof IntensityTypeId

/** @public */
export class BoundedIntensity extends Schema.TaggedClass<BoundedIntensity>()('Bounded', IntensityConfig.fields) {
  readonly [IntensityTypeId] = IntensityTypeId
}

/** @public */
export class UnboundedIntensity extends Schema.TaggedClass<UnboundedIntensity>()('Unbounded', {}) {
  readonly [IntensityTypeId] = IntensityTypeId
}

/** @public */
export const Intensity = Schema.Union([BoundedIntensity, UnboundedIntensity])
/** @public */
export type Intensity = typeof Intensity.Type

/** @public */
export class ChildPolicyConfig extends Schema.Class<ChildPolicyConfig>('ChildPolicyConfig')(
  {
    restart: Schema.optional(Schema.Literals(['permanent', 'transient', 'temporary'])),
    intensity: Schema.optional(IntensityConfig),
  },
) {}

/** @public */
export class SupervisorPolicyConfig extends Schema.Class<SupervisorPolicyConfig>('SupervisorPolicyConfig')(
  { intensity: Schema.optional(IntensityConfig), cooldown: Schema.optional(Schema.Duration) },
) {}

/** @public */
export class LockPolicyConfig extends Schema.Class<LockPolicyConfig>('LockPolicyConfig')(
  { mode: Schema.optional(Schema.Literals(['none', 'required', 'optional'])), key: Schema.optional(Schema.String) },
) {}

/** @public */
export class TickPolicyConfig extends Schema.Class<TickPolicyConfig>('TickPolicyConfig')(
  {
    spanName: Schema.optional(Schema.String),
    tickTimeout: Schema.Duration,
    startLogLevel: Schema.optional(Schema.Literals(['debug', 'info'])),
  },
) {}

/** @public */
export const MaxChildren = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING })),
  Schema.brand('MaxChildren'),
)
/** @public */
export type MaxChildren = typeof MaxChildren.Type

const CapOutsideSpan = Schema.Int.pipe(
  Schema.check(Schema.makeFilter((children) => children < 1 || children > MAX_CHILDREN_CEILING)),
)

const decodesChildRestart = Schema.decodeUnknownExit(ChildPolicyConfig)
const decodesLockMode = Schema.decodeUnknownExit(LockPolicyConfig)
const decodesTickLogLevel = Schema.decodeUnknownExit(TickPolicyConfig)
const decodesSupervisorPolicy = Schema.decodeUnknownExit(SupervisorPolicyConfig)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Duration, Exit } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  // An over- or under-cap integer shares the integer/bound node, so it cannot
  // discriminate under v4's per-node weakening; it is still a refusal contract.
  it.prop(
    '∀c_CapOutsideSpan_⊥',
    [Schema.toArbitrary(CapOutsideSpan)(fc)],
    ([children]) => Exit.isFailure(Schema.decodeExit(MaxChildren)(children)),
  )

  /**
   * The accepted value set of each policy field, written down rather than drawn from the schema.
   *
   * An arbitrary derived from the schema cannot police this: shrink the literal union to one member
   * and the generator shrinks with it, so the round-trip law still passes. Measured - these three
   * properties are what turn the `Schema.Literal` mutants in this cell from survivors into kills,
   * and the accepted set is a decision rather than declaration data, which is why no ignorer covers
   * it.
   */
  it.prop(
    '∀x_AcceptedChildRestart_→decodes',
    [fc.constantFrom('permanent', 'transient', 'temporary')],
    ([restart]) => Exit.isSuccess(decodesChildRestart({ restart })),
  )

  it.prop(
    '∀x_AcceptedLockMode_→decodes',
    [fc.constantFrom('none', 'required', 'optional')],
    ([mode]) => Exit.isSuccess(decodesLockMode({ mode })),
  )

  it.prop(
    '∀x_AcceptedStartLogLevel_→decodes',
    [fc.constantFrom('debug', 'info')],
    ([startLogLevel]) => Exit.isSuccess(decodesTickLogLevel({ startLogLevel, tickTimeout: Duration.seconds(1) })),
  )

  it.prop(
    '∀x_UnlistedChildRestart_→rejects',
    [fc.string().filter((s) => !['permanent', 'transient', 'temporary'].includes(s))],
    ([restart]) => Exit.isFailure(decodesChildRestart({ restart })),
  )

  /**
   * A rejection per class, which is what an emptied fields object fails.
   *
   * Accepting a listed value passes whether or not the field is declared - `Schema.Class` ignores an
   * unknown key - so only a rejection observes the declaration. Measured: without these two, the
   * `{}` mutant on each fields object survives.
   */
  it.prop(
    '∀x_UnlistedLockMode_→rejects',
    [fc.string().filter((mode) => !['none', 'required', 'optional'].includes(mode))],
    ([mode]) => Exit.isFailure(decodesLockMode({ mode })),
  )

  it.prop(
    '∀x_NonDurationCooldown_→rejects',
    [fc.oneof(fc.string(), fc.integer(), fc.boolean())],
    ([cooldown]) => Exit.isFailure(decodesSupervisorPolicy({ cooldown })),
  )

  const window = Duration.seconds(1)
  const negative = fc.integer({ min: -100, max: -1 })

  it.prop(
    '∀r_NegativeRestarts_⊥',
    [negative.map((restarts) => ({ restarts, window }))],
    ([input]) => Exit.isFailure(Schema.decodeExit(IntensityConfig)(input)),
  )
}
