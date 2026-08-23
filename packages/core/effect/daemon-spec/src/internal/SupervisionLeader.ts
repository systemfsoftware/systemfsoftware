import { Context, Duration } from 'effect'
import { UnboundedIntensity } from '../DaemonPolicy.schema.js'
import type { SupervisionConfig } from '../DaemonSpec.schema.js'

/** @internal */
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
