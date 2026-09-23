import { Duration, Effect, Function, Schedule } from 'effect'

export const cappedBackoff: {
  (cap: Duration.Input): (base: Duration.Input) => Schedule.Schedule<Duration.Duration>
  (base: Duration.Input, cap: Duration.Input): Schedule.Schedule<Duration.Duration>
} = Function.dual(
  2,
  (base: Duration.Input, cap: Duration.Input): Schedule.Schedule<Duration.Duration> => {
    const ceiling = Duration.fromInputUnsafe(cap)
    return Schedule.exponential(base).pipe(
      Schedule.jittered,
      Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, ceiling))),
    )
  },
)
