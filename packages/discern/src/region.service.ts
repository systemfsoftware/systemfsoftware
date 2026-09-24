import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

/**
 * The enclosing region stack. It has a default, so it never appears in an
 * Effect's requirements, and an observation recorded outside any {@link region}
 * is attributed to the empty path.
 */
export const CurrentRegion: Context.Reference<ReadonlyArray<string>> = Context.Reference<ReadonlyArray<string>>(
  '@systemfsoftware/discern/CurrentRegion',
  { defaultValue: (): ReadonlyArray<string> => [] },
)

export const region = (name: string) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(
    CurrentRegion.useSync((path) => path),
    (parent) => Effect.provideService(effect, CurrentRegion, [...parent, name]),
  )
