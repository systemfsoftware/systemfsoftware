import type { Effect } from 'effect'
import type runtime from './runtime.kernel.js'

export type RuntimeContext = Effect.Effect.Context<Parameters<typeof runtime.runPromise>[0]>

export type RunSafe = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) => Promise<A>
