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
