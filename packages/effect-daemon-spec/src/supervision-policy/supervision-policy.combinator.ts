import { Context, Duration, Effect } from 'effect'
import { SupervisionPolicyTypeId } from '../daemon-spec/brands.kernel.js'
import { BoundedIntensity, UnboundedIntensity } from '../daemon-spec/daemon-policy.schema.js'
import type { SupervisionConfig, SupervisionPolicy } from '../daemon-spec/daemon-spec.schema.js'
import { cappedPolicyKernel } from './supervision-capped.kernel.js'
import { taskKernel } from './supervision-task.kernel.js'

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

export const leader = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.map(
    Effect.flatMap(LeaderConfig, (config) => cappedPolicyKernel(config, cap)),
    (built) => ({ ...built, [SupervisionPolicyTypeId]: SupervisionPolicyTypeId }),
  )

export const supervision = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.map(
    Effect.flatMap(WorkerConfig, (config) => cappedPolicyKernel(config, cap)),
    (built) => ({ ...built, [SupervisionPolicyTypeId]: SupervisionPolicyTypeId }),
  )

export const task = (budget: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.map(
    Effect.flatMap(TaskConfig, (config) => taskKernel(config, budget)),
    (built) => ({ ...built, [SupervisionPolicyTypeId]: SupervisionPolicyTypeId }),
  )

export const custom = (
  policy: Omit<SupervisionPolicy, typeof SupervisionPolicyTypeId>,
): Effect.Effect<SupervisionPolicy> => Effect.succeed({ ...policy, [SupervisionPolicyTypeId]: SupervisionPolicyTypeId })
