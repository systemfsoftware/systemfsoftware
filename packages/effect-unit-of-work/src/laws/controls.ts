import type { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Effect, Exit } from 'effect'
import { close, mint } from '../UnitOfWork/unit.handle.js'

/** Must fail the race law (R72f): the Durable Object unit run as `Effect.runPromise`, with no transaction. */
export const doRunPromise = <D>(makeDriver: () => D): UnitOfWork.UnitOfWork<D> =>
<A, E, R>(
  use: (unit: UnitOfWork.Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UnitOfWork.StoreUnavailable, R> =>
  Effect.flatMap(Effect.context<R>(), (context) =>
    Effect.suspend(() => {
      const unit = Effect.runSync(mint(makeDriver()))
      return Effect.flatMap(
        Effect.promise(() =>
          Effect.runPromiseExit(Effect.provideContext(Effect.ensuring(use(unit), close(unit)), context))
        ),
        (exit) =>
          Exit.match(exit, {
            onSuccess: (value): Effect.Effect<A, E> => Effect.succeed(value),
            onFailure: (cause) => Effect.failCause(cause),
          }),
      )
    }))
