import { Duration, Effect, Schedule } from 'effect'

export const task = <
  INTENSITY,
  COOLDOWN extends Duration.DurationInput,
  BACKOFFBASE extends Duration.DurationInput,
>(
  config: { readonly intensity: INTENSITY; readonly backoffBase: BACKOFFBASE; readonly cooldown: COOLDOWN },
  budget: Duration.DurationInput,
): Effect.Effect<
  { readonly intensity: INTENSITY; readonly backoff: Schedule.Schedule<Duration.Duration>; readonly cooldown: COOLDOWN }
> =>
  Effect.succeed({
    intensity: config.intensity,
    backoff: Schedule.exponential(config.backoffBase).pipe(Schedule.jittered, Schedule.upTo(budget)),
    cooldown: config.cooldown,
  })
