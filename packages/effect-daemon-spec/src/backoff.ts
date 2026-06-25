import { Duration, Schedule } from 'effect'

export const cappedBackoff = (
  base: Duration.DurationInput,
  cap: Duration.DurationInput,
): Schedule.Schedule<Duration.Duration> => {
  const ceiling = Duration.decode(cap)
  return Schedule.exponential(base).pipe(
    Schedule.jittered,
    Schedule.modifyDelay((_, delay) => Duration.min(delay, ceiling)),
  )
}
