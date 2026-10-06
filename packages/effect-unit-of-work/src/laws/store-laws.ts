import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Cause, Effect, Option } from 'effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  Comparison,
  CrossKeyCommute,
  EndedUnit,
  EngineRerun,
  JudgeLaw,
  judgeLaw,
  type LawObservation,
  SerialOrder,
  type Verdict,
} from './judge-law.workflow.js'

export const READ_AFTER_WRITE = 'a read after a successful write returns the value written'
export const IDEMPOTENT_READ = 'a repeated read returns the same value'
export const CROSS_KEY_COMMUTE = 'operations on different keys commute'
export const FAILED_UNIT_WRITES_NOTHING = 'a unit of work that fails writes nothing'
export const CONCURRENT_UNITS_SERIAL = 'concurrent units for one key leave a state some serial order would leave'
export const ENDED_UNIT_DIES = 'a unit kept after its unit of work ended dies before touching the store'
export const ENGINE_RERUNS_SERIALIZATION_FAILURE = 'an engine 40001 re-runs the whole unit once'

export type Entry = readonly [key: string, value: string]

export interface StoreSubject<D> {
  readonly unitOfWork: UnitOfWork.UnitOfWork<D>
  readonly read: (
    unit: UnitOfWork.Unit<D>,
    key: string,
  ) => Effect.Effect<Option.Option<string>, UnitOfWork.StoreUnavailable>
  readonly write: (
    unit: UnitOfWork.Unit<D>,
    key: string,
    value: string,
  ) => Effect.Effect<void, UnitOfWork.StoreUnavailable>
}

export interface EngineRetrySubject<D> extends StoreSubject<D> {
  readonly armSerializationFailure: Effect.Effect<void>
  readonly unitRuns: Effect.Effect<number>
}

const judge = (law: string, observation: LawObservation): Verdict =>
  Result.getOrThrow(judgeLaw(new JudgeLaw({ law, observation })))

const rendered = (value: string): string => JSON.stringify(value)

const renderedRead = (observed: Option.Option<string>): string =>
  Option.match(observed, { onNone: () => 'absent', onSome: rendered })

const readAfterWriteOver = <D>(
  subject: StoreSubject<D>,
  key: string,
  value: string,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  subject.unitOfWork((unit) =>
    Effect.gen(function*() {
      yield* subject.write(unit, key, value)
      const observed = yield* subject.read(unit, key)
      return judge(READ_AFTER_WRITE, new Comparison({ expected: rendered(value), observed: renderedRead(observed) }))
    })
  )

export const readAfterWrite: {
  <D>(key: string, value: string): (subject: StoreSubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(subject: StoreSubject<D>, key: string, value: string): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(3, readAfterWriteOver)

const idempotentReadOver = <D>(
  subject: StoreSubject<D>,
  key: string,
  value: string,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  subject.unitOfWork((unit) =>
    Effect.gen(function*() {
      yield* subject.write(unit, key, value)
      const first = yield* subject.read(unit, key)
      const second = yield* subject.read(unit, key)
      return judge(IDEMPOTENT_READ, new Comparison({ expected: renderedRead(first), observed: renderedRead(second) }))
    })
  )

export const idempotentRead: {
  <D>(key: string, value: string): (subject: StoreSubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(subject: StoreSubject<D>, key: string, value: string): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(3, idempotentReadOver)

const writeThenRead = <D>(
  subject: StoreSubject<D>,
  writes: readonly [Entry, Entry],
  reads: readonly [string, string],
) =>
(unit: UnitOfWork.Unit<D>): Effect.Effect<string, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    yield* subject.write(unit, writes[0][0], writes[0][1])
    yield* subject.write(unit, writes[1][0], writes[1][1])
    const first = yield* subject.read(unit, reads[0])
    const second = yield* subject.read(unit, reads[1])
    return `${renderedRead(first)}|${renderedRead(second)}`
  })

const crossKeyCommuteOver = <D>(
  subject: StoreSubject<D>,
  left: Entry,
  right: Entry,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    const reads: readonly [string, string] = [left[0], right[0]]
    const ordered = yield* subject.unitOfWork(writeThenRead(subject, [left, right], reads))
    const reversed = yield* subject.unitOfWork(writeThenRead(subject, [right, left], reads))
    return judge(
      CROSS_KEY_COMMUTE,
      new CrossKeyCommute({
        expected: `${rendered(left[1])}|${rendered(right[1])}`,
        ordered,
        reversed,
      }),
    )
  })

export const crossKeyCommute: {
  <D>(left: Entry, right: Entry): (subject: StoreSubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(subject: StoreSubject<D>, left: Entry, right: Entry): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(3, crossKeyCommuteOver)

const failedUnitWritesNothingOver = <D>(
  subject: StoreSubject<D>,
  key: string,
  value: string,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    const failure = new UnitOfWork.StoreUnavailable({ cause: 'the law refused the unit' })
    const refused = subject.unitOfWork((unit) =>
      Effect.flatMap(subject.write(unit, key, value), () => Effect.fail(failure))
    )
    yield* Effect.exit(refused)
    const observed = yield* subject.unitOfWork((unit) => subject.read(unit, key))
    return judge(FAILED_UNIT_WRITES_NOTHING, new Comparison({ expected: 'absent', observed: renderedRead(observed) }))
  })

export const failedUnitWritesNothing: {
  <D>(key: string, value: string): (subject: StoreSubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(subject: StoreSubject<D>, key: string, value: string): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(3, failedUnitWritesNothingOver)

const concurrentUnitsSerializeOver = <D>(
  subject: StoreSubject<D>,
  key: string,
  first: string,
  second: string,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    const write = (value: string) => subject.unitOfWork((unit) => subject.write(unit, key, value))
    yield* Effect.all([write(first), write(second)], { concurrency: 'unbounded' })
    const observed = yield* subject.unitOfWork((unit) => subject.read(unit, key))
    return judge(
      CONCURRENT_UNITS_SERIAL,
      new SerialOrder({ observed: renderedRead(observed), candidates: [rendered(first), rendered(second)] }),
    )
  })

export const concurrentUnitsSerialize: {
  <D>(
    key: string,
    first: string,
    second: string,
  ): (subject: StoreSubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(
    subject: StoreSubject<D>,
    key: string,
    first: string,
    second: string,
  ): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(4, concurrentUnitsSerializeOver)

const endedUnitDiesOver = <D>(subject: StoreSubject<D>): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    const leaked = yield* subject.unitOfWork((unit) => Effect.succeed(unit))
    const died = yield* UnitOfWork.use(leaked, () => Effect.void).pipe(
      Effect.matchCause({ onFailure: Cause.hasDies, onSuccess: () => false }),
    )
    return judge(ENDED_UNIT_DIES, new EndedUnit({ died }))
  })

export const endedUnitDies: {
  <D>(subject: StoreSubject<D>): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = endedUnitDiesOver

const engineRerunsSerializationFailureOver = <D>(
  subject: EngineRetrySubject<D>,
  key: string,
  value: string,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  Effect.gen(function*() {
    yield* subject.armSerializationFailure
    yield* subject.unitOfWork((unit) => subject.write(unit, key, value))
    const runs = yield* subject.unitRuns
    const observed = yield* subject.unitOfWork((unit) => subject.read(unit, key))
    return judge(
      ENGINE_RERUNS_SERIALIZATION_FAILURE,
      new EngineRerun({ runs, expected: rendered(value), observed: renderedRead(observed) }),
    )
  })

export const engineRerunsSerializationFailure: {
  <D>(
    key: string,
    value: string,
  ): (subject: EngineRetrySubject<D>) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
  <D>(subject: EngineRetrySubject<D>, key: string, value: string): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
} = dual(3, engineRerunsSerializationFailureOver)
