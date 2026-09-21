import { Effect, HashMap, Option, Ref, Semaphore } from 'effect'

/**
 * In-process {@link CustomerGate}: one single-permit `Semaphore` per
 * `customerId`, created on first use and held in a `Ref`-guarded `HashMap`.
 *
 * This is a single-process gate — it serializes concurrent orders inside one
 * running server, which is the example's scope. A multi-process deployment
 * would replace it with a Postgres advisory lock keyed by `customerId`
 * (`pg_advisory_xact_lock`), because two processes share no semaphore.
 */
export const make = Effect.gen(function*() {
  const gates = yield* Ref.make(HashMap.empty<string, Semaphore.Semaphore>())
  return {
    withGate: <A, E, R>(customerId: string, effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(
        Ref.modify(gates, (current) =>
          Option.match(HashMap.get(current, customerId), {
            onNone: () => {
              const semaphore = Semaphore.makeUnsafe(1)
              return [semaphore, HashMap.set(current, customerId, semaphore)] as const
            },
            onSome: (semaphore) => [semaphore, current] as const,
          })),
        (semaphore) => semaphore.withPermit(effect),
      ),
  }
})
