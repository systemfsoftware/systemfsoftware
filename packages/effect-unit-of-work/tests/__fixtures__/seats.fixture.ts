import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  type ClaimDecision,
  Granted,
  type RaceSubject,
  Refused,
  type StoreSubject,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { Context, Effect, Layer, Option, Ref } from 'effect'

export type SeatsState = Readonly<Record<string, string>>

export const SEAT_CAP = 100

type Unavailable = UnitOfWork.StoreUnavailable
type SeatsUnit = UnitOfWork.Unit<SeatsDriver>

interface SeatsDriver {
  readonly read: (key: string) => Effect.Effect<Option.Option<string>, Unavailable>
  readonly write: (key: string, value: string) => Effect.Effect<void, Unavailable>
  readonly claim: (request: string) => Effect.Effect<ClaimDecision, Unavailable>
  readonly count: (prefix: string) => Effect.Effect<number, Unavailable>
}

const empty: SeatsState = {}

const keysWithPrefix = (state: SeatsState, prefix: string): readonly string[] =>
  Object.keys(state).filter((key) => key.startsWith(prefix))

const makeDriver = (state: Ref.Ref<SeatsState>): SeatsDriver => ({
  read: (key) => Effect.map(Ref.get(state), (current) => Option.fromUndefinedOr(current[key])),
  write: (key, value) => Ref.update(state, (current) => ({ ...current, [key]: value })),
  claim: (request): Effect.Effect<ClaimDecision, Unavailable> =>
    Effect.flatMap(
      Ref.get(state),
      (current): Effect.Effect<ClaimDecision, Unavailable> =>
        keysWithPrefix(current, 'seat/').length >= SEAT_CAP
          ? Effect.succeed(new Refused({}))
          : Ref.update(state, (held) => ({ ...held, [`seat/${keysWithPrefix(held, 'seat/').length}`]: request })).pipe(
            Effect.as(new Granted({})),
          ),
    ),
  count: (prefix) => Effect.map(Ref.get(state), (current) => keysWithPrefix(current, prefix).length),
})

const useDriver = <A, E, R>(
  unit: SeatsUnit,
  f: (driver: SeatsDriver) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => UnitOfWork.use(unit, f)

const subjectOf = (port: UnitOfWork.UnitOfWork<SeatsDriver>): StoreSubject<SeatsDriver> => ({
  unitOfWork: port,
  read: (unit, key) => useDriver(unit, (driver) => driver.read(key)),
  write: (unit, key, value) => useDriver(unit, (driver) => driver.write(key, value)),
})

const raceOf = (port: UnitOfWork.UnitOfWork<SeatsDriver>, cap: number): RaceSubject<SeatsDriver> => ({
  ...subjectOf(port),
  cap,
  claim: (unit, request) => useDriver(unit, (driver) => driver.claim(request)),
  count: (unit) => useDriver(unit, (driver) => driver.count('seat/')),
})

const memorySubject: Effect.Effect<StoreSubject<SeatsDriver>> = Effect.map(
  UnitOfWork.memory(empty, makeDriver),
  subjectOf,
)

const memoryRace = (cap: number): Effect.Effect<RaceSubject<SeatsDriver>> =>
  Effect.map(UnitOfWork.memory(empty, makeDriver), (port) => raceOf(port, cap))

const escapingSubject: Effect.Effect<StoreSubject<SeatsDriver>> = Effect.gen(function*() {
  const outside = yield* Ref.make(empty)
  const driver = makeDriver(outside)
  const port = yield* UnitOfWork.memory(empty, () => driver)
  return subjectOf(port)
})

export class SeatsStore extends Context.Service<
  SeatsStore,
  {
    readonly subject: Effect.Effect<StoreSubject<SeatsDriver>>
    readonly race: (cap: number) => Effect.Effect<RaceSubject<SeatsDriver>>
    readonly escapingSubject: Effect.Effect<StoreSubject<SeatsDriver>>
  }
>()('@systemfsoftware/effect-unit-of-work/tests/SeatsStore') {}

export const seatsStoreLayer: Layer.Layer<SeatsStore> = Layer.succeed(SeatsStore, {
  subject: memorySubject,
  race: memoryRace,
  escapingSubject,
})
