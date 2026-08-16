import type * as Effect from 'effect/Effect'
import type runtime from './runtime.kernel.js'

export type RuntimeContext = Effect.Services<Parameters<typeof runtime.runPromise>[0]>

export type RunSafe = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) => Promise<A>
