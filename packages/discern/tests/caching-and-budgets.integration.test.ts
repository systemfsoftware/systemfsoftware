import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import {
  type AnswerFor,
  answering,
  answersFor,
  classificationEverywhere,
  CountingModel,
  probabilityAnswer,
  probabilityEverywhere,
  tally,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

const Change = Discern.on(Schema.String)

const reviewRisk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const blocking = Discern.type(Schema.String).pipe(
  Discern.when(reviewRisk.above(0.8), () => 'block'),
  Discern.orElse(() => 'ship'),
)

const firstQuestion = Change.probability({ id: 'a', instructions: 'First' })
const secondQuestion = Change.probability({ id: 'b', instructions: 'Second' })

const onlyFirst = Discern.type(Schema.String).pipe(
  Discern.when(firstQuestion.above(0.8), () => 'a'),
  Discern.orElse(() => 'none'),
)

const both = Discern.type(Schema.String).pipe(
  Discern.when(Discern.and(firstQuestion.above(0.8), secondQuestion.above(0.8)), () => 'both'),
  Discern.orElse(() => 'none'),
)

const scheduledRisk = Change.probability({ id: 'risk', instructions: 'Risky' })
const scheduledUrgency = Change.probability({ id: 'urgent', instructions: 'Urgent' })

const riskPolicy = Discern.type(Schema.String).pipe(
  Discern.when(scheduledRisk.above(0.8), () => 'risky'),
  Discern.orElse(() => 'safe'),
)

const urgencyPolicy = Discern.type(Schema.String).pipe(
  Discern.when(scheduledUrgency.above(0.8), () => 'now'),
  Discern.orElse(() => 'later'),
)

const reviewProgram = (change: string) =>
  Effect.gen(function*() {
    const risk = yield* riskPolicy(change)
    const urgency = yield* urgencyPolicy(change)
    return `${risk}/${urgency}`
  })

const byUrgency: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: (decision) => probabilityAnswer(decision.instructions === 'Risky' ? 0.95 : 0.1),
  })

const offersIn = (criteria: { readonly safe: string; readonly breaking: string }) =>
  Discern.on(Schema.String).classify({ id: 'impact', instructions: 'Classify', criteria })

const safeFirst = offersIn({ safe: 'Safe', breaking: 'Breaks callers' })
const breakingFirst = offersIn({ breaking: 'Breaks callers', safe: 'Safe' })

const shipIfSafe = (decision: Discern.ClassifyDecision<string, 'safe' | 'breaking', typeof Schema.String>) =>
  Discern.type(Schema.String).pipe(
    Discern.when(decision.is('safe'), () => 'ok'),
    Discern.orElse(() => 'no'),
  )

const ticketFactsPolicy = () => {
  const Ticket = Schema.Struct({ a: Schema.Finite, b: Schema.Finite })
  const ticketBusiness = Discern.on(Ticket).probability({ id: 'busy', instructions: 'How busy is this ticket' })
  return Discern.type(Ticket).pipe(
    Discern.when(ticketBusiness.above(0.8), () => 'yes'),
    Discern.orElse(() => 'no'),
  )
}

Feature('Reusing answers without paying twice')
  .withScenarioLayer(answering(probabilityEverywhere(0.95)))
  .body(({ scenario }) => {
    scenario(
      'A cache answers a repeat review without asking the model again',
      Gherkin.Do.pipe(
        Given('a handler that counts each run')('counter', () => Effect.succeed(tally())),
        Given('a blocking policy on top of that handler')(
          'policy',
          (s) =>
            Effect.succeed(
              Discern.type(Schema.String).pipe(
                Discern.when(reviewRisk.above(0.8), () => {
                  s.counter.bump()
                  return 'block'
                }),
                Discern.orElse(() => 'ship'),
              ),
            ),
        ),
        Given('a cache over one store')('cache', () => Effect.succeed(Discern.Model.store())),
        When('the same change is reviewed twice through the cache')('verdicts', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const firstRun = yield* withProvider(s.policy('same'), model.model, [Discern.Model.caching(s.cache)])
            const secondRun = yield* withProvider(s.policy('same'), model.model, [Discern.Model.caching(s.cache)])
            return { firstRun, secondRun }
          })),
        Then('the second review reuses the recorded answer but still runs its own handler')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              firstRun: s.verdicts.firstRun,
              secondRun: s.verdicts.secondRun,
              modelCalls: model.calls(),
              handlerRuns: s.counter.count(),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              firstRun: 'block',
              secondRun: 'block',
              modelCalls: 1,
              handlerRuns: 2,
            })
          ))
        ),
      ),
    )

    scenario(
      'A cache hands over only the answers it already holds',
      Gherkin.Do.pipe(
        Given('a policy asking one question, and one asking two')(
          'policies',
          () => Effect.succeed({ first: onlyFirst, both }),
        ),
        Given('a cache over one store')('cache', () => Effect.succeed(Discern.Model.store())),
        When('the one-question policy runs, then the two-question policy follows')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const first = yield* withProvider(s.policies.first('x'), model.model, [Discern.Model.caching(s.cache)])
              const second = yield* withProvider(s.policies.both('x'), model.model, [Discern.Model.caching(s.cache)])
              return { first, second }
            }),
        ),
        Then('the second run asks only about the question it lacks')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              firstRun: s.verdicts.first,
              secondRun: s.verdicts.second,
              asked: model.asked(),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              firstRun: 'a',
              secondRun: 'both',
              asked: [['a'], ['b']],
            })
          ))
        ),
      ),
    )

    scenario(
      'A budget stops the model once the allowance is spent',
      Gherkin.Do.pipe(
        Given('a blocking policy')('policy', () => Effect.succeed(blocking)),
        Given('an allowance of two decisions')('spend', () => Effect.succeed(Discern.Model.budget({ decisions: 2 }))),
        When('three changes are reviewed under that allowance')('outcomes', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const first = yield* withProvider(s.policy('a'), model.model, [Discern.Model.budgeted(s.spend)])
            const second = yield* withProvider(s.policy('b'), model.model, [Discern.Model.budgeted(s.spend)])
            const third = yield* Effect.flip(withProvider(s.policy('c'), model.model, [
              Discern.Model.budgeted(s.spend),
            ]))
            return { first, second, third }
          })),
        Then('the first two pass, the third is refused, and the spend is reported')((s, expect) =>
          Effect.gen(function*() {
            return {
              first: s.outcomes.first,
              second: s.outcomes.second,
              third: s.outcomes.third,
              spent: yield* Discern.Model.spent(s.spend),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toMatchObject({
              first: 'block',
              second: 'block',
              third: { _tag: 'AiError', module: 'Discern', method: 'budgeted' },
              spent: { decisions: 2, calls: 2 },
            })
          ))
        ),
      ),
    )

    scenario(
      'Answers served from the cache cost the budget nothing',
      Gherkin.Do.pipe(
        Given('a blocking policy')('policy', () => Effect.succeed(blocking)),
        Given('a cache over one store')('cache', () => Effect.succeed(Discern.Model.store())),
        Given('an allowance of a single decision')(
          'spend',
          () => Effect.succeed(Discern.Model.budget({ decisions: 1 })),
        ),
        When('the same change is reviewed twice through cache and allowance')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const stack = [Discern.Model.caching(s.cache), Discern.Model.budgeted(s.spend)]
              const firstRun = yield* withProvider(s.policy('x'), model.model, stack)
              const secondRun = yield* withProvider(s.policy('x'), model.model, stack)
              return { firstRun, secondRun }
            }),
        ),
        Then('only the first review drew from the allowance')((s, expect) =>
          Effect.gen(function*() {
            return {
              firstRun: s.verdicts.firstRun,
              secondRun: s.verdicts.secondRun,
              spent: yield* Discern.Model.spent(s.spend),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              firstRun: 'block',
              secondRun: 'block',
              spent: { decisions: 1, calls: 1 },
            })
          ))
        ),
      ),
    )

    scenario(
      'One recording covers a program that asks several policies',
      { scenarioLayer: answering(byUrgency) },
      Gherkin.Do.pipe(
        Given('a program that asks a risk policy and then an urgency policy')(
          'program',
          () => Effect.succeed(reviewProgram),
        ),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a change runs through the program with recording switched on')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.program('x'), model.model, [Discern.Model.recording(s.store)])
          })),
        Then('the whole program replays from the one recording')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const recorded = {
              verdict: s.verdict,
              modelCalls: model.calls(),
              storedObservations: yield* Discern.Model.size(s.store),
            }
            const taken = yield* Discern.Model.snapshot(s.store)
            const replayed = yield* Effect.provide(s.program('x'), Discern.Model.replayLayer(taken))
            return { ...recorded, replayed, modelCallsAfterReplay: model.calls() }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              verdict: 'risky/later',
              modelCalls: 2,
              storedObservations: 2,
              replayed: 'risky/later',
              modelCallsAfterReplay: 2,
            })
          ))
        ),
      ),
    )

    scenario(
      'A question whose answers are offered in a new order is asked again',
      {
        scenarioLayer: answering(
          classificationEverywhere({ label: 'safe', probabilities: { safe: 0.9, breaking: 0.1 } }),
        ),
      },
      Gherkin.Do.pipe(
        Given('the same question with its answers declared in two orders')('policies', () =>
          Effect.succeed({
            safeFirst: shipIfSafe(safeFirst),
            breakingFirst: shipIfSafe(breakingFirst),
          })),
        Given('a cache over one store')('cache', () => Effect.succeed(Discern.Model.store())),
        When('both wordings are reviewed through the cache')('verdicts', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const first = yield* withProvider(s.policies.safeFirst('x'), model.model, [Discern.Model.caching(s.cache)])
            const second = yield* withProvider(s.policies.breakingFirst('x'), model.model, [
              Discern.Model.caching(s.cache),
            ])
            return { first, second }
          })),
        Then('the reordered question is asked again instead of reusing the answer')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              firstFingerprint: safeFirst.fingerprint,
              secondFingerprint: breakingFirst.fingerprint,
              firstRun: s.verdicts.first,
              secondRun: s.verdicts.second,
              modelCalls: model.calls(),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toSatisfy(
              (observed) =>
                observed.firstFingerprint !== observed.secondFingerprint &&
                observed.firstRun === 'ok' &&
                observed.secondRun === 'ok' &&
                observed.modelCalls === 2,
              'the reordered answers are a different question (distinct fingerprints), and both runs still answer ok on two model calls',
            )
          ))
        ),
      ),
    )

    scenario(
      'The same facts in a different order are the same question to the cache',
      Gherkin.Do.pipe(
        Given('a policy over a set of facts about one ticket')('policy', () => Effect.succeed(ticketFactsPolicy())),
        Given('a cache over one store')('cache', () => Effect.succeed(Discern.Model.store())),
        When('the facts arrive in two different orders')('verdicts', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const first = yield* withProvider(s.policy({ a: 1, b: 2 }), model.model, [Discern.Model.caching(s.cache)])
            const second = yield* withProvider(s.policy({ b: 2, a: 1 }), model.model, [Discern.Model.caching(s.cache)])
            return { first, second }
          })),
        Then('the second order is served from the first answer')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              firstRun: s.verdicts.first,
              secondRun: s.verdicts.second,
              modelCalls: model.calls(),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              firstRun: 'yes',
              secondRun: 'yes',
              modelCalls: 1,
            })
          ))
        ),
      ),
    )

    scenario(
      'A spend record with an unreadable count is refused',
      Gherkin.Do.pipe(
        Given('a spend record whose decision count is not a number')(
          'payload',
          () => Effect.succeed({ decisions: 'two', calls: 0 }),
        ),
        When('the spend record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Model.BudgetSpend)(s.payload)),
        ),
        Then('the unreadable count is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["decisions"\]/) },
          })
        ),
      ),
    )

    scenario(
      'An allowance that promises endless decisions is refused',
      Gherkin.Do.pipe(
        Given('an allowance claiming an endless number of decisions')(
          'payload',
          () => Effect.succeed({ decisions: Number.POSITIVE_INFINITY }),
        ),
        When('the allowance is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeResult(Discern.Model.BudgetLimits)(s.payload)),
        ),
        Then('the endless allowance is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["decisions"\]/) },
          })
        ),
      ),
    )
  })
