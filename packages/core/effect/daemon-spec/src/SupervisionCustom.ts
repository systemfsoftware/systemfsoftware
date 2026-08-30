import { Effect } from 'effect'

/** @public */
export const custom = <P>(policy: P): Effect.Effect<P> => Effect.succeed(policy)
