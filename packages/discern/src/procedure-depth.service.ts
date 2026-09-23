import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'

export const CurrentDepth: Context.Reference<number> = Context.Reference<number>(
  '@systemfsoftware/discern/CurrentDepth',
  { defaultValue: () => 0 },
)

export const MaxDepth: Context.Reference<number> = Context.Reference<number>('@systemfsoftware/discern/MaxDepth', {
  defaultValue: () => 8,
})

export const withMaxDepth: {
  (limit: number): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, limit: number): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, limit: number): Effect.Effect<A, E, R> =>
    Effect.provideService(effect, MaxDepth, limit),
)
