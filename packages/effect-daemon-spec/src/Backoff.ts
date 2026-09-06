import { Duration, Effect, Schedule } from 'effect'

export const cappedBackoff = (
  base: Duration.Input,
  cap: Duration.Input,
): Schedule.Schedule<Duration.Duration> => {
  const ceiling = Duration.fromInputUnsafe(cap)
  return Schedule.exponential(base).pipe(
    Schedule.jittered,
    Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, ceiling))),
  )
}
