import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  Broken,
  concurrentUnitsSerialize,
  crossKeyCommute,
  endedUnitDies,
  ENGINE_RERUNS_SERIALIZATION_FAILURE,
  EngineRerun,
  FAILED_UNIT_WRITES_NOTHING,
  failedUnitWritesNothing,
  Held,
  idempotentRead,
  JudgeLaw,
  judgeLaw,
  RACE,
  Race,
  race,
  readAfterWrite,
  type Verdict,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { Cause, Effect, Option } from 'effect'
import * as Result from 'effect/Result'
import { SEAT_CAP, SeatsStore, seatsStoreLayer } from './__fixtures__/seats.fixture.js'

const Feature = makeFeature({ it })

const judged = (law: string, observation: EngineRerun | Race): Verdict =>
  Result.getOrThrow(judgeLaw(new JudgeLaw({ law, observation })))

const heldEverywhere = () => ({
  readAfterWrite: Held.make({}),
  idempotentRead: Held.make({}),
  crossKeyCommute: Held.make({}),
  failedUnitWritesNothing: Held.make({}),
  concurrentUnitsSerialize: Held.make({}),
  endedUnitDies: Held.make({}),
})

const storeSubject = Effect.gen(function*() {
  const store = yield* SeatsStore
  return yield* store.subject
})

const escapingStore = Effect.gen(function*() {
  const store = yield* SeatsStore
  return yield* store.escapingSubject
})

const raceStore = Effect.gen(function*() {
  const store = yield* SeatsStore
  return yield* store.race(SEAT_CAP)
})

Feature('Holding a store read-decide-write inside one unit of work')
  .withLayer(seatsStoreLayer)
  .body(({ scenario }) => {
    scenario(
      'A committed unit leaves the value it wrote',
      Gherkin.Do.pipe(
        Given('a store whose units run one at a time')('subject', () => storeSubject),
        When('a unit writes a claim and reads it back')('observed', (s) =>
          Effect.flatMap(
            s.subject.unitOfWork((unit) => s.subject.write(unit, 'order/1', 'settled')),
            () => s.subject.unitOfWork((unit) => s.subject.read(unit, 'order/1')),
          )),
        Then('the read finds the value the unit wrote')((s, expect) =>
          expect(s.observed).toEqual(Option.some('settled'))
        ),
      ),
    )

    scenario(
      'A unit kept past its work refuses to touch the store',
      Gherkin.Do.pipe(
        Given('a store whose units run one at a time')('subject', () => storeSubject),
        When('a unit is kept after its unit of work returns and used again')(
          'defect',
          (s) =>
            Effect.flatMap(
              s.subject.unitOfWork((unit) => Effect.succeed(unit)),
              (leaked) =>
                UnitOfWork.use(leaked, () => Effect.void).pipe(
                  Effect.matchCause({ onFailure: Cause.squash, onSuccess: () => Cause.empty }),
                ),
            ),
        ),
        Then('the store reports that the unit had already ended')((s, expect) =>
          expect(s.defect).toEqual(new UnitOfWork.UnitEnded({}))
        ),
      ),
    )

    scenario(
      'A leaked unit and a failed unit both obey the store laws',
      Gherkin.Do.pipe(
        Given('a store whose units run one at a time')('subject', () => storeSubject),
        When('the base and unit laws run against it')('verdicts', (s) =>
          Effect.all({
            readAfterWrite: readAfterWrite(s.subject, 'order/1', 'settled'),
            idempotentRead: idempotentRead(s.subject, 'order/2', 'settled'),
            crossKeyCommute: crossKeyCommute(s.subject, ['order/3', 'held'], ['order/4', 'held']),
            failedUnitWritesNothing: failedUnitWritesNothing(s.subject, 'order/5', 'settled'),
            concurrentUnitsSerialize: concurrentUnitsSerialize(s.subject, 'order/6', 'first', 'second'),
            endedUnitDies: endedUnitDies(s.subject),
          })),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(heldEverywhere())),
      ),
    )

    scenario(
      'A store that writes outside its unit fails the failed-unit law',
      Gherkin.Do.pipe(
        Given('a store whose writes escape its unit of work')('subject', () => escapingStore),
        When('the failed-unit law runs against it')(
          'verdict',
          (s) => failedUnitWritesNothing(s.subject, 'order/1', 'settled'),
        ),
        Then('the law reports the write the failed unit left behind')((s, expect) =>
          expect(s.verdict).toEqual(
            Broken.make({ law: FAILED_UNIT_WRITES_NOTHING, witness: 'expected absent, observed "settled"' }),
          )
        ),
      ),
    )

    scenario(
      'Three hundred claims over a hundred seats grant exactly a hundred',
      Gherkin.Do.pipe(
        Given('a store with a hundred seats')('subject', () => raceStore),
        When('three hundred claims race for a seat')('verdict', (s) => race(s.subject, 300)),
        Then('the race law holds')((s, expect) => expect(s.verdict).toEqual(Held.make({}))),
      ),
    )

    scenario(
      'The race law names an oversell',
      Gherkin.Do.pipe(
        Given('a hundred-seat cap with three hundred claims, one hundred and one of them granted')(
          'oversell',
          () => Effect.succeed(new Race({ requested: 300, cap: 100, granted: 101, decided: 300, rows: 101 })),
        ),
        When('the kit judges what the claims decided')('verdict', (s) => Effect.sync(() => judged(RACE, s.oversell))),
        Then('the verdict names the oversell')((s, expect) =>
          expect(s.verdict).toEqual(
            Broken.make({ law: RACE, witness: 'granted 101 of 100, cap 100 over 300 claims' }),
          )
        ),
      ),
    )

    scenario(
      'The engine law counts the runs a serialization failure forced',
      Gherkin.Do.pipe(
        Given('a once-armed serialization failure that re-ran the unit twice and committed its value')(
          'rerun',
          () => Effect.succeed(new EngineRerun({ runs: 2, expected: '"settled"', observed: '"settled"' })),
        ),
        Given('the same failure that re-ran the unit only once')(
          'once',
          () => Effect.succeed(new EngineRerun({ runs: 1, expected: '"settled"', observed: '"settled"' })),
        ),
        When('the kit judges both outcomes')('verdicts', (s) =>
          Effect.sync(() => ({
            committed: judged(ENGINE_RERUNS_SERIALIZATION_FAILURE, s.rerun),
            once: judged(ENGINE_RERUNS_SERIALIZATION_FAILURE, s.once),
          }))),
        Then('only the twice-run unit holds')((s, expect) =>
          expect(s.verdicts).toEqual({
            committed: Held.make({}),
            once: Broken.make({
              law: ENGINE_RERUNS_SERIALIZATION_FAILURE,
              witness: 'the unit ran 1 time(s) under a once-armed 40001, not twice',
            }),
          })
        ),
      ),
    )
  })
