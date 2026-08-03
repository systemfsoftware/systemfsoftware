import { Context, Duration } from 'effect'
import { UnboundedIntensity } from '../daemon-policy.schema.js'
import type { SupervisionConfig } from '../daemon-spec.schema.js'

export class LeaderConfig extends Context.Reference<LeaderConfig>()(
  '@systemfsoftware/effect-daemon-spec/LeaderConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(1),
      intensity: new UnboundedIntensity(),
      cooldown: Duration.zero,
    }),
  },
) {}
