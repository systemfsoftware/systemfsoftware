import { expect, it, owned } from '@systemfsoftware/vitest'
import { Cause } from 'effect'
import { Effect } from 'effect'
import { Exit } from 'effect'

const observed = (): number => 1
const marker = (): string => 'owned check'

it.effect('Should_SurfaceTheFailureInTheCause_When_OwnedExpectThrows', () =>
  Effect.gen(function*() {
    const exit = yield* Effect.exit(owned(Effect.sync(() => expect(observed()).toEqual(2))))
    if (Exit.isSuccess(exit)) {
      return yield* Effect.sync(() => expect(marker()).toEqual('threw'))
    }
    const rendered = Cause.pretty(exit.cause)
    return yield* Effect.sync(() => expect(rendered).toContain('expected 1 to deeply equal 2'))
  }))
