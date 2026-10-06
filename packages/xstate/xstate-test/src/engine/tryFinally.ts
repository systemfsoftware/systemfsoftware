import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'

/**
 * Runs `finalizer` after `body` exactly as JavaScript's `try/finally` does: the
 * finalizer runs whether the body succeeds or fails, and its failure — not the
 * body's — becomes the result. `Effect.ensuring` keeps the body's cause
 * instead, so the conversions from `try/finally` use this.
 */
export const tryFinally: {
  <XE, XR>(
    finalizer: Effect.Effect<unknown, XE, XR>,
  ): <A, E, R>(body: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    body: Effect.Effect<A, E, R>,
    finalizer: Effect.Effect<unknown, XE, XR>,
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(2, <A, E, R, XE, XR>(
  body: Effect.Effect<A, E, R>,
  finalizer: Effect.Effect<unknown, XE, XR>,
): Effect.Effect<A, E | XE, R | XR> =>
  Effect.gen(function*() {
    const bodyExit = yield* Effect.exit(body)
    // Unconditional; a failure here wins over the body's, as `finally` does.
    yield* finalizer
    if (Exit.isFailure(bodyExit)) {
      return yield* Effect.failCause(bodyExit.cause)
    }
    return bodyExit.value
  }))
