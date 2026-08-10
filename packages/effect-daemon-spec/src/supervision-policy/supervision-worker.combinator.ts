import { Context, Duration, Effect } from 'effect'
import { BoundedIntensity } from '../daemon-spec/daemon-policy.schema.js'
import type { SupervisionConfig, SupervisionPolicy } from '../daemon-spec/daemon-spec.schema.js'
import { workerKernel } from './supervision-worker.kernel.js'

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

export const supervision = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(WorkerConfig, (config) => workerKernel(config, cap))
