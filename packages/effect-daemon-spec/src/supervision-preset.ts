import { Context, Duration, Effect, Schedule } from 'effect'
import { cappedBackoff } from './backoff.js'
import { BoundedIntensity, Intensity, UnboundedIntensity } from './daemon-policy.schema.js'

export interface SupervisionPolicy {
  readonly intensity: Intensity
  readonly backoff: Schedule.Schedule<Duration.Duration>
  readonly cooldown: Duration.DurationInput
}

export interface SupervisionConfig {
  readonly backoffBase: Duration.DurationInput
  readonly intensity: Intensity
  readonly cooldown: Duration.DurationInput
}

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

export const Supervision = {
  leader: (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
    Effect.gen(function*() {
      const config = yield* LeaderConfig
      return { intensity: config.intensity, backoff: cappedBackoff(config.backoffBase, cap), cooldown: config.cooldown }
    }),

  worker: (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
    Effect.gen(function*() {
      const config = yield* WorkerConfig
      return { intensity: config.intensity, backoff: cappedBackoff(config.backoffBase, cap), cooldown: config.cooldown }
    }),

  task: (budget: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
    Effect.gen(function*() {
      const config = yield* TaskConfig
      return {
        intensity: config.intensity,
        backoff: Schedule.exponential(config.backoffBase).pipe(Schedule.jittered, Schedule.upTo(budget)),
        cooldown: config.cooldown,
      }
    }),

  custom: (policy: SupervisionPolicy): Effect.Effect<SupervisionPolicy> => Effect.succeed(policy),
} as const
