import { it } from '@systemfsoftware/vitest'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { tryFinally } from '../src/engine/tryFinally.js'

const outcome = (exit: Exit.Exit<unknown, unknown>): string => {
  if (Exit.isSuccess(exit)) {
    return `ok:${String(exit.value)}`
  }
  const error: unknown = Cause.squash(exit.cause)
  return `error:${error instanceof Error ? error.message : String(error)}`
}

it('Should_MatchTryFinallyPrecedence_When_Body AndFinalizerSettle', function*({ expect }) {
  const bothTyped = yield* Effect.exit(
    tryFinally(Effect.fail('body' as const), Effect.fail('finalizer' as const)),
  )
  const finalizerTypedOnly = yield* Effect.exit(
    tryFinally(Effect.succeed('value'), Effect.fail('finalizer' as const)),
  )
  const bodyTypedOnly = yield* Effect.exit(
    tryFinally(Effect.fail('body' as const), Effect.void),
  )
  const neither = yield* Effect.exit(
    tryFinally(Effect.succeed('value'), Effect.void),
  )
  const bothThrown = yield* Effect.exit(
    tryFinally(
      Effect.sync(() => {
        throw new Error('body-thrown')
      }),
      Effect.sync(() => {
        throw new Error('finalizer-thrown')
      }),
    ),
  )
  const finalizerThrownOnly = yield* Effect.exit(
    tryFinally(Effect.succeed('value'), Effect.sync(() => {
      throw new Error('finalizer-thrown')
    })),
  )

  yield* expect({
    bothTyped: outcome(bothTyped),
    finalizerTypedOnly: outcome(finalizerTypedOnly),
    bodyTypedOnly: outcome(bodyTypedOnly),
    neither: outcome(neither),
    bothThrown: outcome(bothThrown),
    finalizerThrownOnly: outcome(finalizerThrownOnly),
  }).toEqual({
    // `finally` throws the finalizer's error, not the body's.
    bothTyped: 'error:finalizer',
    finalizerTypedOnly: 'error:finalizer',
    bodyTypedOnly: 'error:body',
    neither: 'ok:value',
    bothThrown: 'error:finalizer-thrown',
    finalizerThrownOnly: 'error:finalizer-thrown',
  })
})
