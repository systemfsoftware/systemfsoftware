/// <reference types="vitest/import-meta" />
import { Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from './SupervisorDynamic.js'

export const IntensityConfig = Schema.Struct({
  restarts: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  window: Schema.Duration,
})
export type IntensityConfig = typeof IntensityConfig.Type

const IntensityTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-spec/Intensity')
export type IntensityTypeId = typeof IntensityTypeId

export class BoundedIntensity extends Schema.TaggedClass<BoundedIntensity>()('Bounded', IntensityConfig.fields) {
  readonly [IntensityTypeId] = IntensityTypeId
}

export class UnboundedIntensity extends Schema.TaggedClass<UnboundedIntensity>()('Unbounded', {}) {
  readonly [IntensityTypeId] = IntensityTypeId
}

export const Intensity = Schema.Union([BoundedIntensity, UnboundedIntensity])
export type Intensity = typeof Intensity.Type

export class ChildPolicyConfig extends Schema.Class<ChildPolicyConfig>('ChildPolicyConfig')(
  {
    restart: Schema.optional(Schema.Literals(['permanent', 'transient', 'temporary'])),
    intensity: Schema.optional(IntensityConfig),
  },
) {}

export class SupervisorPolicyConfig extends Schema.Class<SupervisorPolicyConfig>('SupervisorPolicyConfig')(
  { intensity: Schema.optional(IntensityConfig), cooldown: Schema.optional(Schema.Duration) },
) {}

export class LockPolicyConfig extends Schema.Class<LockPolicyConfig>('LockPolicyConfig')(
  { mode: Schema.optional(Schema.Literals(['none', 'required', 'optional'])), key: Schema.optional(Schema.String) },
) {}

export class TickPolicyConfig extends Schema.Class<TickPolicyConfig>('TickPolicyConfig')(
  {
    spanName: Schema.optional(Schema.String),
    tickTimeout: Schema.Duration,
    startLogLevel: Schema.optional(Schema.Literals(['debug', 'info'])),
  },
) {}

export const MaxChildren = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING })),
  Schema.brand('MaxChildren'),
)
export type MaxChildren = typeof MaxChildren.Type

const CapOutsideSpan = Schema.Int.pipe(
  Schema.check(
    Schema.makeFilter((children) => children < 1 || children > MAX_CHILDREN_CEILING, {
      arbitrary: {
        candidate: {
          weight: 20,
          make: (fc) => fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: MAX_CHILDREN_CEILING + 1 })),
        },
      },
    }),
  ),
)

const decodesChildRestart = Schema.decodeUnknownExit(ChildPolicyConfig)
const decodesLockMode = Schema.decodeUnknownExit(LockPolicyConfig)
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

  it.prop(
    '∀x_UnlistedChildRestart_→rejects',
    [
      Schema.toArbitrary(Schema.String)(fc).filter((s) => !['permanent', 'transient', 'temporary'].includes(s)).map((
        restart,
      ) => ({ restart })),
    ],
    ([{ restart }]) => Exit.isFailure(decodesChildRestart({ restart })),
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
    [
      Schema.toArbitrary(Schema.String)(fc).filter((s) => !['none', 'required', 'optional'].includes(s)).map((
        mode,
      ) => ({ mode })),
    ],
    ([{ mode }]) => Exit.isFailure(decodesLockMode({ mode })),
  )

  it.prop(
    '∀x_NonDurationCooldown_→rejects',
    [
      Schema.toArbitrary(Schema.Union([Schema.String, Schema.Int, Schema.Boolean]))(fc).map((cooldown) => ({
        cooldown,
      })),
    ],
    ([{ cooldown }]) => Exit.isFailure(decodesSupervisorPolicy({ cooldown })),
  )

  const window = Duration.seconds(1)
  const negative = fc.integer({ min: -100, max: -1 })

  it.prop(
    '∀r_NegativeRestarts_⊥',
    [negative.map((restarts) => ({ restarts, window }))],
    ([input]) => Exit.isFailure(Schema.decodeExit(IntensityConfig)(input)),
  )
  it.prop(
    '∀x_AcceptedSets_⊆SchemaDomain',
    [
      Schema.toArbitrary(ChildPolicyConfig)(fc),
      Schema.toArbitrary(LockPolicyConfig)(fc),
      Schema.toArbitrary(TickPolicyConfig)(fc),
    ],
    ([child, lock, tick]) =>
      (child.restart === undefined || ['permanent', 'transient', 'temporary'].includes(child.restart)) &&
      (lock.mode === undefined || ['none', 'required', 'optional'].includes(lock.mode)) &&
      (tick.startLogLevel === undefined || ['debug', 'info'].includes(tick.startLogLevel)),
  )

  it.prop(
    '∀x_AcceptedCooldown_∈Duration',
    [Schema.toArbitrary(SupervisorPolicyConfig)(fc)],
    ([cfg]) => cfg.cooldown === undefined || Duration.isDuration(cfg.cooldown),
  )

  it.prop(
    '∀r_AcceptedRestarts_≥0',
    [Schema.toArbitrary(IntensityConfig)(fc)],
    ([cfg]) => cfg.restarts >= 0,
  )
}
