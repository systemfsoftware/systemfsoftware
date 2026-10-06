import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Held, type Verdict } from '@systemfsoftware/effect-unit-of-work/laws'
import { type PostgresUnitFailure, retryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Effect, Exit, Layer, Option, Ref } from 'effect'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'
import { tripwires } from './__fixtures__/broken-law-subjects.fixture.js'
import {
  LAW_NAMES,
  LAW_TITLES,
  type LawFailure,
  type LawName,
  LawSubject,
  memorySubject,
} from './__fixtures__/law-subject.fixture.js'
import { adapterSchedule, type PostgresSeats, postgresSeatsFor } from './__fixtures__/postgres-seats.fixture.js'
import {
  postgresPgliteSubject,
  postgresServerStores,
  postgresServerSubject,
} from './__fixtures__/postgres-subject.fixture.js'
import { durableObjectSubject } from './__fixtures__/workerd.fixture.js'

const Feature = makeFeature({ it })

/**
 * Every adapter the suite drives, each as its own subject Layer. `cannotRun` is the explicit list of
 * laws the subject does not answer for, each with the reason: a subject without a 40001 engine omits
 * the engine law rather than skipping it silently, and PGlite — one connection — cannot race. Every
 * other law is a row the subject must hold.
 */
type SubjectRow = {
  readonly name: string
  readonly layer: Layer.Layer<LawSubject, never, SqlClient>
  readonly cannotRun: Partial<Record<LawName, string>>
}

const subjects: readonly SubjectRow[] = [
  {
    name: 'memory',
    layer: memorySubject,
    cannotRun: {
      engineRerunsSerializationFailure: 'memory has no engine that raises 40001',
    },
  },
  {
    name: 'durableObject',
    layer: durableObjectSubject,
    cannotRun: {
      engineRerunsSerializationFailure: 'the Durable Object has no engine that raises 40001',
    },
  },
  {
    name: 'postgres (server)',
    layer: postgresServerSubject,
    cannotRun: {},
  },
  {
    name: 'postgres (pglite)',
    layer: postgresPgliteSubject,
    cannotRun: {
      race: 'PGlite has one connection, so two units cannot race',
    },
  },
]

const answeredLaws = (subject: SubjectRow): readonly LawName[] =>
  LAW_NAMES.filter((law) => subject.cannotRun[law] === undefined)

const excusedLaws = (subject: SubjectRow): ReadonlyArray<readonly [LawName, string]> =>
  LAW_NAMES.flatMap((law) =>
    Option.match(Option.fromUndefinedOr(subject.cannotRun[law]), {
      onNone: () => [],
      onSome: (reason) => [[law, reason]],
    })
  )

const heldRows = subjects.flatMap((subject) =>
  answeredLaws(subject).map((law) => ({
    subject: subject.name,
    law,
    lawTitle: LAW_TITLES[law],
    layer: subject.layer,
  }))
)

const excusedRows = subjects.flatMap((subject) =>
  excusedLaws(subject).map(([law, reason]) => ({
    subject: subject.name,
    law,
    lawTitle: LAW_TITLES[law],
    reason,
    layer: subject.layer,
  }))
)

const brokenRows = tripwires.map((tripwire) => ({
  name: tripwire.name,
  law: tripwire.law,
  lawTitle: LAW_TITLES[tripwire.law],
  layer: tripwire.layer,
  broken: tripwire.broken,
}))

const runLawIn = (
  layer: Layer.Layer<LawSubject, never, SqlClient>,
  law: LawName,
): Effect.Effect<Verdict, LawFailure, SqlClient> =>
  LawSubject.pipe(Effect.flatMap((service) => service.runLaw(law)), Effect.provide(layer))

/** The suite's one throwaway server, as the law subject the adapter-specific scenarios reach for. */
const serverSeats: Effect.Effect<PostgresSeats, never, SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient
  return yield* postgresSeatsFor(sql, yield* retryBudget(3, adapterSchedule))
}).pipe(Effect.orDie)

const failureTag = (outcome: Result.Result<void, PostgresUnitFailure | SqlError>): string =>
  Result.match(outcome, { onSuccess: () => 'ran', onFailure: (failure) => failure._tag })

const valueName = (observed: Option.Option<string>): string =>
  Option.match(observed, { onNone: () => 'absent', onSome: (value) => value })

Feature("Every adapter's unit of work obeys the same store laws", { timeout: 300_000 })
  .withLayer(postgresServerStores)
  .live(
    'the Durable Object subject runs each law inside real workerd, and the Postgres subjects inside a real PostgreSQL 17 and real wasm PGlite',
  )
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'The <subject> subject holds the law that <lawTitle>',
      heldRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a subject that answers for named laws')('lawSubject', () => Effect.succeed(row)),
          When('the law runs against the subject')('verdict', (s) => runLawIn(s.lawSubject.layer, s.lawSubject.law)),
          Then('the law holds')((s, expect) => expect(s.verdict).toEqual(Held.make({}))),
        ),
    )

    scenarioOutline(
      'The <subject> subject cannot run <lawTitle>: <reason>',
      excusedRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a subject that omits a law it cannot answer for')('lawSubject', () => Effect.succeed(row)),
          When('the suite asks it to run that law')(
            'outcome',
            (s) => runLawIn(s.lawSubject.layer, s.lawSubject.law).pipe(Effect.exit),
          ),
          Then('the subject refuses rather than answering')((s, expect) =>
            expect(s.outcome).toSatisfy(Exit.isFailure, 'a subject cannot answer for a law it does not run')
          ),
        ),
    )

    scenarioOutline(
      'A subject broken in <name> is caught by the law that <lawTitle>',
      brokenRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a deliberately broken subject')('lawSubject', () => Effect.succeed(row)),
          When('the law runs against it')('verdict', (s) => runLawIn(s.lawSubject.layer, s.lawSubject.law)),
          Then('the law reports what it observed')((s, expect) => expect(s.verdict).toEqual(s.lawSubject.broken)),
        ),
    )

    scenario(
      'A unit opened inside an open transaction is refused',
      Gherkin.Do.pipe(
        Given('the shared PostgreSQL 17 server')('seats', () => serverSeats),
        When('a caller opens a transaction and runs a unit inside it')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              const ran = yield* Ref.make(0)
              const refused = yield* Effect.result(
                s.seats.sql.withTransaction(
                  s.seats.unitOfWork((unit) =>
                    Effect.andThen(
                      Ref.update(ran, (count) => count + 1),
                      s.seats.raw.write(unit, 'law/nested', 'settled'),
                    )
                  ),
                ),
              )
              const uses = yield* Ref.get(ran)
              const written = yield* s.seats.unitOfWork((unit) => s.seats.raw.read(unit, 'law/nested'))
              return { refused, uses, written }
            }),
        ),
        Then('the unit fails on the nested-transaction tag, never ran, and wrote nothing')((s, expect) =>
          expect({ tag: failureTag(s.observed.refused), uses: s.observed.uses, written: valueName(s.observed.written) })
            .toEqual({ tag: 'UnitInsideTransaction', uses: 0, written: 'absent' })
        ),
      ),
    )
  })
