import { Context, Duration } from 'effect'
import { UnboundedIntensity } from '../daemon-policy.schema.js'
import type { SupervisionConfig } from '../daemon-spec.schema.js'

export const LeaderConfig = Context.Reference<SupervisionConfig>(
  '@systemfsoftware/effect-daemon-spec/LeaderConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(1),
      intensity: UnboundedIntensity.make(),
      cooldown: Duration.zero,
    }),
  },
)
