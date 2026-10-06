import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Held, type Verdict } from '@systemfsoftware/effect-unit-of-work/laws'
import { Effect, Layer } from 'effect'
import { tripwires } from './__fixtures__/broken-law-subjects.fixture.js'
import { LAW_TITLES, type LawName, LawSubject, memorySubject } from './__fixtures__/law-subject.fixture.js'

const Feature = makeFeature({ it })

/**
 * Every adapter the suite drives, each as its own subject Layer. `laws` is the explicit list the
 * subject answers for: a subject without a 40001 engine omits engineRerunsSerializationFailure
 * rather than skipping it silently, and L2/L3 add one entry each for the Durable Object and
 * Postgres subjects.
 */
type HeldSubject = {
  readonly name: string
  readonly layer: Layer.Layer<LawSubject>
  readonly laws: readonly LawName[]
}

const heldSubjects: readonly HeldSubject[] = [
  {
    name: 'memory',
    layer: memorySubject,
    // Memory mints units in-process and has no engine that raises 40001, so the engine-rerun law
    // is not in this subject's list. The engine's live coverage is Postgres (L3); the workflow's
    // engine branches are still exercised by the openly broken engine subjects below.
    laws: [
      'readAfterWrite',
      'idempotentRead',
      'crossKeyCommute',
      'failedUnitWritesNothing',
      'concurrentUnitsSerialize',
      'endedUnitDies',
      'race',
    ],
  },
]

const runLawIn = (
  layer: Layer.Layer<LawSubject>,
  law: LawName,
): Effect.Effect<Verdict, UnitOfWork.StoreUnavailable> =>
  LawSubject.pipe(
    Effect.flatMap((service) => service.runLaw(law)),
    Effect.provide(layer),
  )

const heldRows = heldSubjects.flatMap((subject) =>
  subject.laws.map((law) => ({
    subject: subject.name,
    law,
    lawTitle: LAW_TITLES[law],
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

Feature("Every adapter's unit of work obeys the same store laws")
  .withLayer(memorySubject)
  .body(({ scenarioOutline }) => {
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
      'A subject broken in <name> is caught by the law that <lawTitle>',
      brokenRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a deliberately broken subject')('lawSubject', () => Effect.succeed(row)),
          When('the law runs against it')('verdict', (s) => runLawIn(s.lawSubject.layer, s.lawSubject.law)),
          Then('the law reports what it observed')((s, expect) => expect(s.verdict).toEqual(s.lawSubject.broken)),
        ),
    )
  })
