import { Duration, Effect, Schedule } from 'effect'

export const task = <
  INTENSITY,
  COOLDOWN extends Duration.Input,
  BACKOFFBASE extends Duration.Input,
>(
  config: { readonly intensity: INTENSITY; readonly backoffBase: BACKOFFBASE; readonly cooldown: COOLDOWN },
  budget: Duration.Input,
): Effect.Effect<
  { readonly intensity: INTENSITY; readonly backoff: Schedule.Schedule<Duration.Duration>; readonly cooldown: COOLDOWN }
> =>
  Effect.succeed({
    intensity: config.intensity,
    backoff: Schedule.exponential(config.backoffBase).pipe(Schedule.jittered, Schedule.upTo({ duration: budget })),
    cooldown: config.cooldown,
  })
