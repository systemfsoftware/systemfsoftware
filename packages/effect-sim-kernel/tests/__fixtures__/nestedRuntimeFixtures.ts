import { Effect } from 'effect'

export const handedToOwnRuntime = (work: Effect.Effect<string>): Effect.Effect<string> =>
  Effect.promise(() => Effect.runPromise(work))

export const finishingAfterGivingWay: Effect.Effect<string> = Effect.andThen(
  Effect.yieldNow,
  Effect.succeed('finished'),
)

export const wakingAfterNinetySeconds: Effect.Effect<string> = Effect.andThen(
  Effect.sleep('90 seconds'),
  Effect.succeed('woke'),
)
