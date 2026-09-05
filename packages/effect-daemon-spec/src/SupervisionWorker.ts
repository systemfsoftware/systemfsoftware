import { Context, Duration, Effect, Schedule } from 'effect'
import { cappedBackoff } from './Backoff.js'
import { BoundedIntensity } from './DaemonPolicy.schema.js'
import type { SupervisionConfig } from './DaemonSpec.schema.js'

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

export const worker = <
  INTENSITY,
  COOLDOWN extends Duration.Input,
  BACKOFFBASE extends Duration.Input,
>(
  config: { readonly intensity: INTENSITY; readonly backoffBase: BACKOFFBASE; readonly cooldown: COOLDOWN },
  cap: Duration.Input,
): Effect.Effect<
  { readonly intensity: INTENSITY; readonly backoff: Schedule.Schedule<Duration.Duration>; readonly cooldown: COOLDOWN }
> =>
  Effect.succeed({
    intensity: config.intensity,
    backoff: cappedBackoff(config.backoffBase, cap),
    cooldown: config.cooldown,
  })
