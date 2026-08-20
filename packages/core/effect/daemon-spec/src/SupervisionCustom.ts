import { Effect } from 'effect'

export const custom = <P>(policy: P): Effect.Effect<P> => Effect.succeed(policy)
