import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Data, Duration, Effect, Fiber, Match, Option, Schedule, Scope } from 'effect'

const POLL_SPACING = Duration.millis(2)
const SETTLE_LIMIT = Duration.seconds(5)

export class LawBroken extends Data.TaggedError('LawBroken')<{
  readonly law: string
  readonly why: string
}> {}

export interface EndedRuns {
  readonly ended: number
  readonly leftOpen: number
}

export interface ProbeStopSubject {
  readonly dial: Effect.Effect<Readiness.DialEvidence>
  readonly exchange: Effect.Effect<Readiness.HttpEvidence>
  readonly inFlight: Effect.Effect<void>
  readonly run: <A, E>(body: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly kill: <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.Effect<void>
  readonly release: <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.Effect<void>
  readonly heldOpen: Effect.Effect<number>
  readonly endedRuns: Effect.Effect<EndedRuns>
}

export interface LawCase {
  readonly name: string
  readonly check: Effect.Effect<void, LawBroken>
}

export type ProbeStopLawSuite = readonly [LawCase, LawCase, LawCase, LawCase]

const broken = (law: string, why: string): Effect.Effect<never, LawBroken> => Effect.fail(new LawBroken({ law, why }))

const answered = (law: string, evidence: Readiness.DialEvidence): Effect.Effect<void, LawBroken> =>
  Match.value(evidence).pipe(
    Match.tag('Connected', () => Effect.void),
    Match.orElse(() => broken(law, 'a dial of the live endpoint did not report it Connected')),
  )

const exchanged = (law: string, evidence: Readiness.HttpEvidence): Effect.Effect<void, LawBroken> =>
  Match.value(evidence).pipe(
    Match.tag('Responded', () => Effect.void),
    Match.orElse(() => broken(law, 'an exchange with the live endpoint did not report a response')),
  )

const whileHeld = (subject: ProbeStopSubject, holds: (held: number) => boolean): Effect.Effect<boolean> =>
  Effect.repeat(subject.heldOpen, { schedule: Schedule.spaced(POLL_SPACING), until: holds }).pipe(
    Effect.timeoutOption(SETTLE_LIMIT),
    Effect.map(Option.exists(holds)),
  )

const heldLetsGo = (law: string, subject: ProbeStopSubject, before: number): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    whileHeld(subject, (held) => held === before),
    (quiet) => quiet ? Effect.void : broken(law, `the endpoint still holds a connection after the stop, not ${before}`),
  )

const nothingBlamed = (law: string, subject: ProbeStopSubject): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    subject.endedRuns,
    (ended) => ended.leftOpen === 0 ? Effect.void : broken(law, `a run that ended left ${ended.leftOpen} open`),
  )

interface InFlight {
  readonly fiber: Fiber.Fiber<void, never>
  readonly before: number
}

const inFlight = (law: string, subject: ProbeStopSubject): Effect.Effect<InFlight, LawBroken> =>
  Effect.gen(function*() {
    const before = yield* subject.heldOpen
    const fiber = yield* Effect.forkDetach(subject.run(subject.inFlight))
    const held = yield* whileHeld(subject, (count) => count > before)
    if (!held) return yield* broken(law, 'the call was never in flight at the endpoint')
    return { fiber, before }
  })

const bothAnswers = (subject: ProbeStopSubject) =>
  Effect.andThen(subject.dial, (dial) => Effect.map(subject.exchange, (exchange) => ({ dial, exchange })))

export const probeStopLaws = (
  subjects: Effect.Effect<ProbeStopSubject, never, Scope.Scope>,
): ProbeStopLawSuite => {
  const lawOf = (
    name: string,
    body: (subject: ProbeStopSubject, law: string) => Effect.Effect<void, LawBroken>,
  ): LawCase => ({
    name,
    check: Effect.scoped(Effect.flatMap(subjects, (subject) => body(subject, name))),
  })

  return [
    lawOf(
      'an ordinary run answers on the live endpoint and leaves nothing open',
      (subject, law) =>
        Effect.gen(function*() {
          const before = yield* subject.heldOpen
          const answers = yield* subject.run(bothAnswers(subject))
          yield* answered(law, answers.dial)
          yield* exchanged(law, answers.exchange)
          const ended = yield* subject.endedRuns
          if (ended.ended === 0) return yield* broken(law, 'an ordinary run was not counted among the runs that ended')
          yield* nothingBlamed(law, subject)
          yield* heldLetsGo(law, subject, before)
        }),
    ),

    lawOf('a run stopped while its call is in flight leaves nothing open', (subject, law) =>
      Effect.gen(function*() {
        const held = yield* inFlight(law, subject)
        yield* Fiber.interrupt(held.fiber)
        yield* heldLetsGo(law, subject, held.before)
        yield* nothingBlamed(law, subject)
      })),

    lawOf('a run started after a stop still answers on the live endpoint', (subject, law) =>
      Effect.gen(function*() {
        const held = yield* inFlight(law, subject)
        yield* Fiber.interrupt(held.fiber)
        yield* heldLetsGo(law, subject, held.before)
        const answers = yield* subject.run(bothAnswers(subject))
        yield* answered(law, answers.dial)
        yield* exchanged(law, answers.exchange)
        yield* nothingBlamed(law, subject)
      })),

    lawOf('a run killed mid-call is not blamed and the endpoint lets it go', (subject, law) =>
      Effect.gen(function*() {
        const held = yield* inFlight(law, subject)
        yield* subject.kill(held.fiber)
        yield* nothingBlamed(law, subject)
        const answers = yield* subject.run(bothAnswers(subject))
        yield* answered(law, answers.dial)
        yield* subject.release(held.fiber)
        yield* heldLetsGo(law, subject, held.before)
      })),
  ]
}
