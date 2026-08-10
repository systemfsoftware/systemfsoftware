import { Context, Duration, Effect } from 'effect'
import { UnboundedIntensity } from '../daemon-spec/daemon-policy.schema.js'
import type { SupervisionConfig, SupervisionPolicy } from '../daemon-spec/daemon-spec.schema.js'
import { taskKernel } from './supervision-task.kernel.js'

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

export const task = (budget: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(TaskConfig, (config) => taskKernel(config, budget))
