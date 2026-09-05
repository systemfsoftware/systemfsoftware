import { Context, Duration, Effect, Schedule } from 'effect'
import { cappedBackoff } from './Backoff.js'
import { UnboundedIntensity } from './DaemonPolicy.schema.js'
import type { SupervisionConfig } from './DaemonSpec.schema.js'

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

export const leader = <
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
