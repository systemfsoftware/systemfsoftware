import { Duration, Effect, Schedule } from 'effect'
import { cappedBackoff } from '../backoff/backoff.kernel.js'

export const leaderKernel = <
  INTENSITY,
  COOLDOWN extends Duration.DurationInput,
  BACKOFFBASE extends Duration.DurationInput,
>(
  config: { readonly intensity: INTENSITY; readonly backoffBase: BACKOFFBASE; readonly cooldown: COOLDOWN },
  cap: Duration.DurationInput,
): Effect.Effect<
  { readonly intensity: INTENSITY; readonly backoff: Schedule.Schedule<Duration.Duration>; readonly cooldown: COOLDOWN }
> =>
  Effect.succeed({
    intensity: config.intensity,
    backoff: cappedBackoff(config.backoffBase, cap),
    cooldown: config.cooldown,
  })
