import { expect, it, owned } from '@effect/vitest'
import { Cause } from 'effect'
import { Effect } from 'effect'
import { Exit } from 'effect'

it.effect('Should_SurfaceTheFailureInTheCause_When_OwnedExpectThrows', () =>
  Effect.gen(function*() {
    const exit = yield* Effect.exit(owned(Effect.sync(() => expect(1).toEqual(2))))
    if (Exit.isSuccess(exit)) {
      return yield* Effect.sync(() => expect('owned check').toEqual('threw'))
    }
    const rendered = Cause.pretty(exit.cause)
    return yield* Effect.sync(() => expect(rendered).toContain('expected 1 to deeply equal 2'))
  }))
