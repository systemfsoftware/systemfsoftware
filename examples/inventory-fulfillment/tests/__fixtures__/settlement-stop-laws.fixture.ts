import { Conformance } from '@systemfsoftware/conformance-spec'
import { Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Deferred, Duration, Effect, Exit, Fiber, Option, type Scope } from 'effect'

const CUTS = ['before-the-read', 'after-the-read', 'after-the-write'] as const
type Cut = (typeof CUTS)[number]

const WRITE_CUT: Cut = 'after-the-write'
const REACH_LIMIT = Duration.seconds(20)

export interface SettlementStopSubject {
  readonly prepare: Effect.Effect<void>
  readonly unitOfWork: <A>(
    use: (unit: Settlement.Unit.SettlementUnit) => Effect.Effect<A, Settlement.Unit.SettlementFailure>,
  ) => Effect.Effect<A, Settlement.Unit.SettlementFailure>
  readonly key: Settlement.Unit.OrderKey
  readonly plan: Settlement.Unit.OrderPlan
  readonly captured: Effect.Effect<Settlement.Unit.SettlementUnit | undefined>
  readonly settledCount: Effect.Effect<number>
  readonly kill: <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.Effect<void>
  readonly release: <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.Effect<void>
}

export interface LawCase {
  readonly name: string
  readonly check: Effect.Effect<void, LawFailure>
}

export type LawFailure = Conformance.RuleBroken | Settlement.Unit.SettlementFailure

export type SettlementStopLawSuite = readonly [LawCase, LawCase, LawCase, LawCase]

const refuse = (message: string): Effect.Effect<never, Conformance.RuleBroken> =>
  Effect.fail(new Conformance.RuleBroken({ message }))

const hold = (reached: Deferred.Deferred<void>): Effect.Effect<void> =>
  Effect.andThen(Deferred.succeed(reached, undefined), Effect.never)

const working =
  (subject: SettlementStopSubject, cut: Cut, reached: Deferred.Deferred<void>) =>
  (unit: Settlement.Unit.SettlementUnit): Effect.Effect<void, Settlement.Unit.SettlementFailure> =>
    Effect.gen(function*() {
      if (cut === 'before-the-read') yield* hold(reached)
      yield* Settlement.Unit.load(unit, subject.key)
      if (cut === 'after-the-read') yield* hold(reached)
      yield* Settlement.Unit.settle(unit, subject.plan)
      if (cut === WRITE_CUT) yield* hold(reached)
    })

const settling = (subject: SettlementStopSubject) => (unit: Settlement.Unit.SettlementUnit) =>
  Effect.andThen(Settlement.Unit.load(unit, subject.key), () => Settlement.Unit.settle(unit, subject.plan))

const reachedOrRefuse = (
  reached: Deferred.Deferred<void>,
  why: string,
): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Deferred.await(reached), REACH_LIMIT),
    (arrived) => Option.isSome(arrived) ? Effect.void : refuse(why),
  )

const settled = (subject: SettlementStopSubject, holds: (count: number) => boolean, why: string) =>
  Effect.flatMap(
    subject.settledCount,
    (count) => holds(count) ? Effect.void : refuse(`${why}, settled ${count} time(s)`),
  )

const stoppedAt = (subject: SettlementStopSubject, cut: Cut): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const reached = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkDetach(subject.unitOfWork(working(subject, cut, reached)))
    yield* reachedOrRefuse(reached, `the stopped run never reached the ${cut} cut`)
    yield* Fiber.interrupt(fiber)
  })

const keptUnitDies = (subject: SettlementStopSubject): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const unit = yield* subject.captured
    if (unit === undefined) return yield* refuse('no unit of work was kept from the stopped run')
    const read = yield* Effect.exit(Settlement.Unit.load(unit, subject.key))
    if (Exit.isSuccess(read)) return yield* refuse('the kept unit of work still read after its run ended')
    const settle = yield* Effect.exit(Settlement.Unit.settle(unit, subject.plan))
    if (Exit.isSuccess(settle)) return yield* refuse('the kept unit of work still settled after its run ended')
  })

export const settlementStopLaws = (
  subjects: Effect.Effect<SettlementStopSubject, never, Scope.Scope>,
): SettlementStopLawSuite => {
  const lawOf = (
    name: string,
    body: (subject: SettlementStopSubject) => Effect.Effect<void, LawFailure>,
  ): LawCase => ({
    name,
    check: Effect.scoped(Effect.flatMap(subjects, body)),
  })

  return [
    lawOf('an ordinary unit of work reads its order and settles it exactly once', (subject) =>
      Effect.gen(function*() {
        yield* subject.prepare
        yield* subject.unitOfWork(settling(subject))
        yield* settled(subject, (count) => count === 1, 'an ordinary unit of work did not settle once')
        yield* keptUnitDies(subject)
      })),

    lawOf('a unit stopped at any step writes nothing and keeps its unit closed', (subject) =>
      Effect.gen(function*() {
        for (const cut of CUTS) {
          yield* subject.prepare
          yield* stoppedAt(subject, cut)
          const holds = cut === WRITE_CUT ? (count: number) => count <= 1 : (count: number) => count === 0
          yield* settled(subject, holds, `a unit stopped ${cut} wrote more than its own step allows`)
          yield* keptUnitDies(subject)
        }
      })),

    lawOf('a unit kept after its stop cannot read or settle again', (subject) =>
      Effect.gen(function*() {
        yield* subject.prepare
        yield* stoppedAt(subject, 'after-the-read')
        yield* keptUnitDies(subject)
        yield* subject.unitOfWork(settling(subject))
        yield* settled(subject, (count) => count === 1, 'the store stopped serving the next unit of work')
      })),

    lawOf(
      'a unit killed mid-call writes nothing and the next unit of work still commits',
      (subject) =>
        Effect.gen(function*() {
          yield* subject.prepare
          const reached = yield* Deferred.make<void>()
          const fiber = yield* Effect.forkDetach(subject.unitOfWork(working(subject, 'after-the-read', reached)))
          yield* reachedOrRefuse(reached, 'the killed run never reached its read')
          yield* subject.kill(fiber)
          yield* settled(subject, (count) => count === 0, 'a unit killed mid-call wrote something')
          yield* subject.unitOfWork(settling(subject))
          yield* settled(subject, (count) => count === 1, 'the next unit of work after the kill did not settle once')
          yield* subject.release(fiber)
        }),
    ),
  ]
}
