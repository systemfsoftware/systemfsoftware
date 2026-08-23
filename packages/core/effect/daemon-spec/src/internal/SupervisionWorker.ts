import { Context, Duration } from 'effect'
import { BoundedIntensity } from '../DaemonPolicy.schema.js'
import type { SupervisionConfig } from '../DaemonSpec.schema.js'

/** @internal */
export const WorkerConfig = Context.Reference<SupervisionConfig>(
  '@systemfsoftware/effect-daemon-spec/WorkerConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(10),
      intensity: BoundedIntensity.make({ restarts: 10, window: Duration.seconds(60) }),
      cooldown: Duration.seconds(30),
    }),
  },
)
