import { type Context, Effect, Exit, Match, Option, Ref } from 'effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import type { StoreUnavailable } from '../UnitOfWork/StoreUnavailable.schema.js'
import type { UnitOfWork } from '../UnitOfWork/unit-of-work.port.js'
import { close, mint, type Unit } from '../UnitOfWork/unit.handle.js'
import { ClassifyUnitExit, classifyUnitExit, type UnitExit, WentAsync } from './classify-unit-exit.workflow.js'
import type { DurableObjectStorage, SqlStorage } from './storage.port.js'
import { UnitRollback } from './unit-rollback.schema.js'
import { UnitWentAsync } from './UnitWentAsync.schema.js'

interface CarriedExit<A, E> {
  readonly exit: Exit.Exit<A, E>
  readonly decision: UnitExit
}

const reRaised = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E> =>
  Exit.match(exit, {
    onSuccess: (value): Effect.Effect<A, E> => Effect.succeed(value),
    onFailure: (cause): Effect.Effect<A, E> => Effect.failCause(cause),
  })

const refuseAsync = (wentAsync: WentAsync): Effect.Effect<never> =>
  Effect.andThen(
    Effect.sync(() => wentAsync.error.fiber.interruptUnsafe()),
    Effect.die(new UnitWentAsync({})),
  )

const decideSettle = <A, E>(settle: CarriedExit<A, E>): Effect.Effect<A, E> =>
  Match.value(settle.decision).pipe(
    Match.tag('Committed', (): Effect.Effect<A, E> => reRaised(settle.exit)),
    Match.tag('RolledBack', (): Effect.Effect<A, E> => reRaised(settle.exit)),
    Match.tag('WentAsync', refuseAsync),
    Match.exhaustive,
  )

const rollBackUnlessCommitted = <A, E>(settle: CarriedExit<A, E>): CarriedExit<A, E> =>
  Match.value(settle.decision).pipe(
    Match.tag('Committed', () => settle),
    Match.tag('RolledBack', (): never => {
      throw new UnitRollback({})
    }),
    Match.tag('WentAsync', (): never => {
      throw new UnitRollback({})
    }),
    Match.exhaustive,
  )

const withinTransaction = <D, A, E, R>(
  settled: Ref.Ref<Option.Option<CarriedExit<A, E>>>,
  storage: DurableObjectStorage,
  makeDriver: (sql: SqlStorage) => D,
  context: Context.Context<R>,
  use: (unit: Unit<D>) => Effect.Effect<A, E, R>,
): CarriedExit<A, E> => {
  const unit = Effect.runSync(mint(makeDriver(storage.sql)))
  const exit = Effect.runSyncExitWith(context)(use(unit))
  Effect.runSync(close(unit))
  const settle = { exit, decision: Result.getOrThrow(classifyUnitExit(new ClassifyUnitExit({ exit }))) }
  Effect.runSync(Ref.set(settled, Option.some(settle)))
  return rollBackUnlessCommitted(settle)
}

const settleOf = <A, E>(
  carried: Option.Option<CarriedExit<A, E>>,
  attempt: Exit.Exit<CarriedExit<A, E>, never>,
): Effect.Effect<A, E> =>
  Exit.match(attempt, {
    onSuccess: decideSettle,
    onFailure: (cause) =>
      Option.match(carried, {
        onSome: decideSettle,
        onNone: (): Effect.Effect<A, E> => Effect.failCause(cause),
      }),
  })

const durableObjectOver = <D>(
  storage: DurableObjectStorage,
  makeDriver: (sql: SqlStorage) => D,
): UnitOfWork<D> =>
<A, E, R>(use: (unit: Unit<D>) => Effect.Effect<A, E, R>): Effect.Effect<A, E | StoreUnavailable, R> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<R>()
    const settled = yield* Ref.make<Option.Option<CarriedExit<A, E>>>(Option.none())
    const attempt = yield* Effect.exit(
      Effect.sync(() => storage.transactionSync(() => withinTransaction(settled, storage, makeDriver, context, use))),
    )
    return yield* settleOf(yield* Ref.get(settled), attempt)
  })

export const durableObject: {
  <D>(makeDriver: (sql: SqlStorage) => D): (storage: DurableObjectStorage) => UnitOfWork<D>
  <D>(storage: DurableObjectStorage, makeDriver: (sql: SqlStorage) => D): UnitOfWork<D>
} = dual(2, durableObjectOver)
