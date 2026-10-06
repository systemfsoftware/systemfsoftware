import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  concurrentUnitsSerialize,
  crossKeyCommute,
  endedUnitDies,
  engineRerunsSerializationFailure,
  failedUnitWritesNothing,
  idempotentRead,
  race,
  readAfterWrite,
  type Verdict,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { Context, Effect, Layer } from 'effect'
import { SEAT_CAP, seatsEngineRetrySubject, seatsRaceSubject, seatsSubject } from './seats.fixture.js'

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

export type LawRun = () => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>

/**
 * The one thing an adapter subject exposes to the law suite: run a named law and answer with its
 * verdict. A subject whose laws execute elsewhere — the Durable Object runs them inside workerd —
 * implements this same contract, so the suite never reaches into an adapter's own shape.
 */
export interface LawSubjectShape {
  readonly runLaw: (law: LawName) => Effect.Effect<Verdict, UnitOfWork.StoreUnavailable>
}

export class LawSubject extends Context.Service<LawSubject, LawSubjectShape>()(
  '@systemfsoftware/effect-unit-of-work/tests/LawSubject',
) {}

export const lawSubjectLayer = (runLaw: LawSubjectShape['runLaw']): Layer.Layer<LawSubject> =>
  Layer.succeed(LawSubject, { runLaw })

const identity = (value: string): string => value

/**
 * The honest in-memory subject's law table: every law mints a fresh seats store, so one scenario
 * can never observe another's writes. The engine entry is a stand-in retry loop; the suite keeps
 * memory off its engine list because a fixture loop is not the 40001 handler a real engine owns.
 */
export const memoryLawRuns: Record<LawName, LawRun> = {
  readAfterWrite: () => Effect.flatMap(seatsSubject, (s) => readAfterWrite(s, 'law/read-after-write', 'settled')),
  idempotentRead: () => Effect.flatMap(seatsSubject, (s) => idempotentRead(s, 'law/idempotent-read', 'settled')),
  crossKeyCommute: () =>
    Effect.flatMap(seatsSubject, (s) => crossKeyCommute(s, ['law/left', 'held'], ['law/right', 'held'])),
  failedUnitWritesNothing: () =>
    Effect.flatMap(seatsSubject, (s) => failedUnitWritesNothing(s, 'law/failed', 'settled')),
  concurrentUnitsSerialize: () =>
    Effect.flatMap(seatsSubject, (s) => concurrentUnitsSerialize(s, 'law/serial', 'first', 'second')),
  endedUnitDies: () => Effect.flatMap(seatsSubject, (s) => endedUnitDies(s)),
  engineRerunsSerializationFailure: () =>
    Effect.flatMap(
      seatsEngineRetrySubject(identity),
      (s) => engineRerunsSerializationFailure(s, 'law/engine', 'settled'),
    ),
  race: () => Effect.flatMap(seatsRaceSubject(SEAT_CAP), (s) => race(s, 300)),
}

/** The honest memory subject as the suite's law-subject Layer. */
export const memorySubject: Layer.Layer<LawSubject> = lawSubjectLayer((law) => memoryLawRuns[law]())

/** A law-subject Layer whose target laws are replaced by a deliberately broken subject's runs. */
export const lawSubjectWith = (overrides: Partial<Record<LawName, LawRun>>): Layer.Layer<LawSubject> =>
  lawSubjectLayer((law) => ({ ...memoryLawRuns, ...overrides })[law]())
