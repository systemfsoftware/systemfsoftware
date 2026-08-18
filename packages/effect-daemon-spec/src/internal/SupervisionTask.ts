import { Context, Duration } from 'effect'
import { UnboundedIntensity } from '../DaemonPolicy.schema.js'
import type { SupervisionConfig } from '../DaemonSpec.schema.js'

export const TaskConfig = Context.Reference<SupervisionConfig>(
  '@systemfsoftware/effect-daemon-spec/TaskConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(1),
      intensity: UnboundedIntensity.make(),
      cooldown: Duration.zero,
    }),
  },
)
