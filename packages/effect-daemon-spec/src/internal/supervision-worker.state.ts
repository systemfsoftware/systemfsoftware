import { Context, Duration } from 'effect'
import { BoundedIntensity } from '../daemon-policy.schema.js'
import type { SupervisionConfig } from '../daemon-spec.schema.js'

export class WorkerConfig extends Context.Reference<WorkerConfig>()(
  '@systemfsoftware/effect-daemon-spec/WorkerConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(10),
      intensity: new BoundedIntensity({ restarts: 10, window: Duration.seconds(60) }),
      cooldown: Duration.seconds(30),
    }),
  },
) {}
