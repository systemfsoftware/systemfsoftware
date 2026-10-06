import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  concurrentUnitsSerialize,
  crossKeyCommute,
  endedUnitDies,
  failedUnitWritesNothing,
  idempotentRead,
  race,
  readAfterWrite,
  type Verdict,
} from '@systemfsoftware/effect-unit-of-work/laws'
import {
  type SerializationBudgetExhausted,
  type UnitInsideTransaction,
} from '@systemfsoftware/effect-unit-of-work/postgres'
import { Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import { SEAT_CAP, seatsRaceSubject, seatsSubject } from './seats.fixture.js'

/** Every law the kit exports, as a stable identifier a subject can be asked to run. */
export const LAW_NAMES = [
  'readAfterWrite',
  'idempotentRead',
  'crossKeyCommute',
  'failedUnitWritesNothing',
  'concurrentUnitsSerialize',
  'endedUnitDies',
  'engineRerunsSerializationFailure',
  'race',
] as const
export type LawName = (typeof LAW_NAMES)[number]

/** A prose phrase for each law, so a scenario title names the guarantee, not the identifier. */
export const LAW_TITLES: Record<LawName, string> = {
  readAfterWrite: 'a read after a write sees it',
  idempotentRead: 'reading twice answers the same',
  crossKeyCommute: 'operations on different keys commute',
  failedUnitWritesNothing: 'a failed unit writes nothing',
  concurrentUnitsSerialize: 'concurrent units land in some serial order',
  endedUnitDies: 'a kept unit dies before touching the store',
  engineRerunsSerializationFailure: 'an engine reruns a serialization failure',
  race: 'claims grant exactly the cap and store one row each',
}

/**
 * Everything a law run can fail with: the store being unavailable, the two failures a Postgres engine
 * names for itself, and the engine's own `SqlError` — what a Postgres subject's driver raises, so the
 * adapter can classify a run and re-run the whole unit. A subject built on memory or a Durable Object
 * only ever produces the first, so its runs fit this union too.
 */
export type LawFailure =
  | UnitOfWork.StoreUnavailable
  | SerializationBudgetExhausted
  | UnitInsideTransaction
  | SqlError

export type LawRun = () => Effect.Effect<Verdict, LawFailure>

/**
 * The one thing an adapter subject exposes to the law suite: run a named law and answer with its
 * verdict. A subject whose laws execute elsewhere — the Durable Object runs them inside workerd —
 * implements this same contract, so the suite never reaches into an adapter's own shape.
 */
export interface LawSubjectShape {
  readonly runLaw: (law: LawName) => Effect.Effect<Verdict, LawFailure>
}

export class LawSubject extends Context.Service<LawSubject, LawSubjectShape>()(
  '@systemfsoftware/effect-unit-of-work/tests/LawSubject',
) {}

/** A law-subject Layer over a table of law runs. A law the table omits is a programming error, not a pass. */
export const lawSubjectOf = (runs: Partial<Record<LawName, LawRun>>): LawSubjectShape => ({
  runLaw: (law) =>
    Option.match(Option.fromUndefinedOr(runs[law]), {
      onNone: () => Effect.die(new Error(`the subject does not answer for the law: ${law}`)),
      onSome: (run) => run(),
    }),
})

export const lawSubjectLayer = (runs: Partial<Record<LawName, LawRun>>): Layer.Layer<LawSubject> =>
  Layer.succeed(LawSubject, lawSubjectOf(runs))

/**
 * The honest in-memory subject's law table: every law mints a fresh seats store, so one scenario can
 * never observe another's writes. The engine-rerun law is deliberately absent — memory has no engine
 * that raises `40001`, and a fixture loop is not the handler a real engine owns; the suite names that
 * absence, and the workflow's engine branches are exercised by the openly broken engine subjects.
 */
export const memoryLawRuns: Partial<Record<LawName, LawRun>> = {
  readAfterWrite: () => Effect.flatMap(seatsSubject, (s) => readAfterWrite(s, 'law/read-after-write', 'settled')),
  idempotentRead: () => Effect.flatMap(seatsSubject, (s) => idempotentRead(s, 'law/idempotent-read', 'settled')),
  crossKeyCommute: () =>
    Effect.flatMap(seatsSubject, (s) => crossKeyCommute(s, ['law/left', 'held'], ['law/right', 'held'])),
  failedUnitWritesNothing: () =>
    Effect.flatMap(seatsSubject, (s) => failedUnitWritesNothing(s, 'law/failed', 'settled')),
  concurrentUnitsSerialize: () =>
    Effect.flatMap(seatsSubject, (s) => concurrentUnitsSerialize(s, 'law/serial', 'first', 'second')),
  endedUnitDies: () => Effect.flatMap(seatsSubject, (s) => endedUnitDies(s)),
  race: () => Effect.flatMap(seatsRaceSubject(SEAT_CAP), (s) => race(s, 300)),
}

/** The honest memory subject as the suite's law-subject Layer. */
export const memorySubject: Layer.Layer<LawSubject> = lawSubjectLayer(memoryLawRuns)

/** A law-subject Layer whose target laws are replaced by a deliberately broken subject's runs. */
export const lawSubjectWith = (overrides: Partial<Record<LawName, LawRun>>): Layer.Layer<LawSubject> =>
  lawSubjectLayer({ ...memoryLawRuns, ...overrides })
