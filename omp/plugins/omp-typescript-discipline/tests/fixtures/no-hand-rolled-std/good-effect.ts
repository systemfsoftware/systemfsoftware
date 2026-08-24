import { Duration, Effect, Schedule, Stream } from 'effect'

const program = Effect.gen(function*() {
  yield* Effect.sleep(Duration.millis(100))
  yield* Effect.sleep('100 millis')
  const retried = yield* Effect.retry(Effect.succeed(42), {
    schedule: Schedule.exponential('100 millis'),
  })
  const timed = yield* Effect.timeout(Effect.succeed(1), Duration.seconds(1))
  const results = yield* Effect.forEach([1, 2, 3], (n) => Effect.succeed(n * 2), {
    concurrency: 4,
  })
  const stream = Stream.fromIterable([1, 2, 3])
  const spaced = Schedule.spaced(Duration.millis(10))
  return results
})
