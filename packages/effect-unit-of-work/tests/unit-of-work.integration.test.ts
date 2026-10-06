import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import { Cause, Effect, Option, Ref } from 'effect'
import { SeatsStore, seatsStoreLayer } from './__fixtures__/seats.fixture.js'

const Feature = makeFeature({ it })

const storeSubject = Effect.gen(function*() {
  const store = yield* SeatsStore
  return yield* store.subject
})

const storeSubjectWithOutsideCounter = Effect.gen(function*() {
  const store = yield* SeatsStore
  const counter = yield* Ref.make(0)
  return { subject: yield* store.subject, counter }
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
      'A unit that fails leaves an outside effect alone while the store is unchanged',
      Gherkin.Do.pipe(
        Given('a store beside a counter that lives outside it')('setup', () => storeSubjectWithOutsideCounter),
        When('a unit writes a claim, bumps the outside counter and then fails')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              const refused = s.setup.subject.unitOfWork((unit) =>
                Effect.flatMap(
                  s.setup.subject.write(unit, 'order/2', 'settled'),
                  () =>
                    Effect.flatMap(
                      Ref.update(s.setup.counter, (n) => n + 1),
                      () => Effect.fail(new UnitOfWork.StoreUnavailable({ cause: 'the unit refused' })),
                    ),
                )
              )
              yield* Effect.exit(refused)
              const left = yield* s.setup.subject.unitOfWork((unit) => s.setup.subject.read(unit, 'order/2'))
              const counted = yield* Ref.get(s.setup.counter)
              return { left, counted }
            }),
        ),
        Then('the store kept nothing and the counter reads one')((s, expect) =>
          expect(s.observed).toEqual({ left: Option.none(), counted: 1 })
        ),
      ),
    )
  })
