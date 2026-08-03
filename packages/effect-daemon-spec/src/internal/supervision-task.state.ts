import { Context, Duration } from 'effect'
import { UnboundedIntensity } from '../daemon-policy.schema.js'
import type { SupervisionConfig } from '../daemon-spec.schema.js'

export class TaskConfig extends Context.Reference<TaskConfig>()(
  '@systemfsoftware/effect-daemon-spec/TaskConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(1),
      intensity: new UnboundedIntensity(),
      cooldown: Duration.zero,
    }),
  },
) {}
