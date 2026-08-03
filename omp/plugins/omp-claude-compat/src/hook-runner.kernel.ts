import type { Effect } from 'effect'

export interface HookRunner<R> {
  readonly runSafe: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>
  readonly dispose: () => Promise<void>
}
