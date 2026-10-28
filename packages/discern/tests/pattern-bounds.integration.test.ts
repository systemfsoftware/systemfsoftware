import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Context, Effect, Layer, MutableRef, Schema } from 'effect'
import type * as AiError from 'effect/ai/AiError'
import type * as DecisionModel from 'effect/ai/DecisionModel'

const Feature = makeFeature({ it })

class CountingModel extends Context.Service<CountingModel, {
  readonly model: Discern.Model.Provider
  readonly calls: () => number
}>()('@systemfsoftware/discern/tests/PatternBoundsModel') {}

const answeringEverythingAt = (probability: number): Layer.Layer<DecisionModel.DecisionModel | CountingModel> =>
  Layer.unwrap(
    Effect.sync(() => {
      const calls = MutableRef.make(0)
      const model = Discern.Model.provider(
        (request): Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError> => {
          MutableRef.set(calls, MutableRef.get(calls) + 1)
          return Effect.succeed({
            answers: Object.fromEntries(
              Arr.map(Object.keys(request.decisions), (id) => [id, { _tag: 'Probability' as const, probability }]),
            ),
            usage: { inputTokens: undefined, outputTokens: undefined },
          })
        },
      )
      return Layer.mergeAll(
        Discern.Model.fromProvider(model),
        Layer.succeed(CountingModel, { model, calls: () => MutableRef.get(calls) }),
      )
    }),
  )

const withProvider = <A, E>(
  effect: Effect.Effect<A, E, DecisionModel.DecisionModel>,
  model: Discern.Model.Provider,
): Effect.Effect<A, E, never> => Effect.provide(effect, Discern.Model.layer(model, []))

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'bounds-risk', instructions: 'Likely to regress' })
const impact = Change.classify({
  id: 'bounds-impact',
  instructions: 'Classify API impact',
  criteria: { none: 'none', breaking: 'breaking' },
})
const severity = Change.rate({
  id: 'bounds-severity',
  instructions: 'Rate severity',
  criteria: ['trivial', 'minor', 'major', 'critical'],
})

const policyOf = (pattern: Discern.Pattern<string>) =>
  Discern.type(Schema.String).pipe(
    Discern.when(pattern, () => 'matched'),
    Discern.orElse(() => 'fallback'),
  )

const refusedAfterAsking = <A, E>(effect: Effect.Effect<A, E, DecisionModel.DecisionModel>) =>
  Effect.gen(function*() {
    const model = yield* CountingModel
    const outcome = yield* Effect.flip(withProvider(effect, model.model))
    return { outcome, asked: model.calls() }
  })

const probabilityAnswers = (probability: number): Discern.Answers => ({ [risk.id]: { probability } })

const ratingAnswers = (rating: number, label: string): Discern.Answers => ({
  [severity.id]: { rating, label, probabilities: { trivial: 0, minor: 0, major: 0, critical: 0 } },
})

const statusesOf = (pattern: Discern.Pattern<string>, answers: ReadonlyArray<Discern.Answers>) =>
  Arr.map(answers, (answered) => Discern.statusOf(Discern.evaluate(pattern, 'change', answered)))

interface InvertedBound {
  readonly name: string
  readonly build: () => Discern.Pattern<string>
  readonly value: number
  readonly limit: number
}

const invertedBounds: ReadonlyArray<InvertedBound> = [
  { name: 'above', build: () => risk.above(0.5, { missBelow: 0.8 }), value: 0.8, limit: 0.5 },
  { name: 'atLeast', build: () => risk.atLeast(0.5, { missBelow: 0.8 }), value: 0.8, limit: 0.5 },
  { name: 'below', build: () => risk.below(0.5, { missAbove: 0.2 }), value: 0.2, limit: 0.5 },
  { name: 'atMost', build: () => risk.atMost(0.5, { missAbove: 0.2 }), value: 0.2, limit: 0.5 },
]

interface ReversedRange {
  readonly name: string
  readonly build: () => Discern.Pattern<string>
  readonly low: number | string
  readonly high: number | string
}

const reversedRanges: ReadonlyArray<ReversedRange> = [
  { name: 'probability span', build: () => risk.between(0.6, 0.4), low: 0.6, high: 0.4 },
  {
    name: 'rating span from major to minor',
    build: () => severity.between('major', 'minor'),
    low: 'major',
    high: 'minor',
  },
  {
    name: 'rating span from critical to trivial',
    build: () => severity.between('critical', 'trivial'),
    low: 'critical',
    high: 'trivial',
  },
]

interface RefusedPattern {
  readonly name: string
  readonly build: () => Discern.Pattern<string>
  readonly refusal: Readonly<Record<string, string | number>>
}

const refusedPatterns: ReadonlyArray<RefusedPattern> = [
  {
    name: 'an inverted miss bound',
    build: () => risk.above(0.5, { missBelow: 0.8 }),
    refusal: { _tag: 'InvalidThresholdError', value: 0.8, limit: 0.5 },
  },
  {
    name: 'a reversed probability span',
    build: () => risk.between(0.6, 0.4),
    refusal: { _tag: 'InvalidRangeError', low: 0.6, high: 0.4 },
  },
]

const onlySourceFiles = Discern.deterministic((path: string) => path.endsWith('.ts'), { id: 'bounds-source-file' })

const twoExamples: ReadonlyArray<Discern.EvalExample<string>> = [
  { input: 'change-1', expected: true },
  { input: 'change-2', expected: false },
]

const crossedClassifyBounds = impact.is('breaking', { match: 0.5, miss: 0.8 })
const crossedBand = risk.band({ match: 0.5, miss: 0.8 })

const crossedThresholds: ReadonlyArray<{ readonly name: string; readonly build: () => Discern.Pattern<string> }> = [
  { name: 'a probability band', build: () => crossedBand },
  { name: 'a classification threshold', build: () => crossedClassifyBounds },
]

Feature('Refusing probability and rating bounds that cannot judge')
  .withScenarioLayer(answeringEverythingAt(0.99))
  .body(({ scenario }) => {
    Arr.forEach(invertedBounds, (bound) => {
      scenario(
        `A ${bound.name} pattern whose miss bound sits past its threshold carries a refusal naming the bound`,
        Gherkin.Do.pipe(
          Given('a probability pattern whose miss bound sits on the wrong side of its threshold')(
            'pattern',
            () => Effect.succeed(bound.build()),
          ),
          When('the pattern is built and its refusals are read')('refusals', (s) => Effect.succeed(s.pattern.refusals)),
          Then('exactly one refusal names the bound and the threshold it crossed')(({ refusals }, expect) =>
            expect(refusals).toMatchObject([{ value: bound.value, limit: bound.limit }])
          ),
        ),
      )

      scenario(
        `A policy using a ${bound.name} pattern with an inverted miss bound is refused before the model is asked`,
        Gherkin.Do.pipe(
          Given('a policy whose only case is that pattern')('policy', () => Effect.succeed(policyOf(bound.build()))),
          When('a change is judged')('outcome', (s) => refusedAfterAsking(s.policy('change'))),
          Then('the run is refused naming the bound, and the model is never asked')(({ outcome }, expect) =>
            expect(outcome).toMatchObject({
              outcome: { _tag: 'InvalidThresholdError', value: bound.value, limit: bound.limit },
              asked: 0,
            })
          ),
        ),
      )
    })

    Arr.forEach(reversedRanges, (range) => {
      scenario(
        `A policy using a reversed ${range.name} is refused before the model is asked`,
        Gherkin.Do.pipe(
          Given('a policy whose only case is a span that ends before it starts')(
            'policy',
            () => Effect.succeed(policyOf(range.build())),
          ),
          When('a change is judged')('outcome', (s) => refusedAfterAsking(s.policy('change'))),
          Then('the run is refused naming both ends of the span, and the model is never asked')(
            ({ outcome }, expect) =>
              expect(outcome).toMatchObject({
                outcome: { _tag: 'InvalidRangeError', low: range.low, high: range.high },
                asked: 0,
              }),
          ),
        ),
      )
    })

    scenario(
      'A miss bound equal to the threshold leaves the pattern two-valued',
      Gherkin.Do.pipe(
        Given('a probability pattern whose miss bound equals its threshold')(
          'pattern',
          () => Effect.succeed(risk.above(0.5, { missBelow: 0.5 })),
        ),
        When('it judges probabilities on both sides of the line')('statuses', (s) =>
          Effect.succeed(
            statusesOf(s.pattern, Arr.map([0, 0.49, 0.5, 0.51, 1], probabilityAnswers)),
          )),
        Then('it matches above the line and misses at or below it, never uncertain')(({ statuses }, expect) =>
          expect(statuses).toEqual(['Miss', 'Miss', 'Miss', 'Match', 'Match'])
        ),
      ),
    )

    scenario(
      'A probability span with equal ends matches exactly that probability',
      Gherkin.Do.pipe(
        Given('a probability span whose two ends are the same value')(
          'pattern',
          () => Effect.succeed(risk.between(0.5, 0.5)),
        ),
        When('it judges 0.5 and 0.51')(
          'statuses',
          (s) => Effect.succeed(statusesOf(s.pattern, Arr.map([0.5, 0.51], probabilityAnswers))),
        ),
        Then('it matches 0.5 and misses 0.51')(({ statuses }, expect) => expect(statuses).toEqual(['Match', 'Miss'])),
      ),
    )

    scenario(
      'A rating span with equal ends matches exactly that level',
      Gherkin.Do.pipe(
        Given('a rating span from major to major')('pattern', () => Effect.succeed(severity.between('major', 'major'))),
        When('it judges a rating of 2 and of 1.5')(
          'statuses',
          (s) => Effect.succeed(statusesOf(s.pattern, [ratingAnswers(2, 'major'), ratingAnswers(1.5, 'minor')])),
        ),
        Then('it matches the level itself and misses the rating between levels')(({ statuses }, expect) =>
          expect(statuses).toEqual(['Match', 'Miss'])
        ),
      ),
    )

    Arr.forEach(crossedThresholds, (crossed) => {
      scenario(
        `A policy using ${crossed.name} whose miss bound is past its match bound keeps its refusal`,
        Gherkin.Do.pipe(
          Given('a policy whose only case treats a miss as stricter than a match')(
            'policy',
            () => Effect.succeed(policyOf(crossed.build())),
          ),
          When('a change is judged')('outcome', (s) => refusedAfterAsking(s.policy('change'))),
          Then('the run is refused naming the crossed bounds, and the model is never asked')(
            ({ outcome }, expect) =>
              expect(outcome).toMatchObject({
                outcome: { _tag: 'InvalidThresholdError', threshold: 'miss', value: 0.8, limit: 0.5 },
                asked: 0,
              }),
          ),
        ),
      )
    })

    Arr.forEach(refusedPatterns, (refused) => {
      scenario(
        `A deterministic guard that already matches does not hide ${refused.name} in a later case`,
        Gherkin.Do.pipe(
          Given('a policy with a matching source-file guard ahead of a refused case')('policy', () =>
            Effect.succeed(
              Discern.type(Schema.String).pipe(
                Discern.when(onlySourceFiles, () => 'guarded'),
                Discern.when(refused.build(), () => 'refused-case'),
                Discern.orElse(() => 'fallback'),
              ),
            )),
          When('a source file the guard matches is judged')('outcome', (s) => refusedAfterAsking(s.policy('index.ts'))),
          Then('the run is refused all the same, and the model is never asked')(({ outcome }, expect) =>
            expect(outcome).toMatchObject({ outcome: refused.refusal, asked: 0 })
          ),
        ),
      )
    })

    scenario(
      'A refused leaf stays refused under and',
      Gherkin.Do.pipe(
        Given('a crossed band conjoined with a source-file guard')(
          'pattern',
          () => Effect.succeed(Discern.and(crossedBand, onlySourceFiles)),
        ),
        When('the composed pattern is built and its refusals are read')(
          'refusals',
          (s) => Effect.succeed(s.pattern.refusals),
        ),
        Then('the composed pattern carries the band refusal')(({ refusals }, expect) =>
          expect(refusals).toMatchObject([{ threshold: 'miss', value: 0.8, limit: 0.5 }])
        ),
      ),
    )

    scenario(
      'A refused leaf stays refused under or',
      Gherkin.Do.pipe(
        Given('a crossed band disjoined with a source-file guard')(
          'pattern',
          () => Effect.succeed(Discern.or(crossedBand, onlySourceFiles)),
        ),
        When('the composed pattern is built and its refusals are read')(
          'refusals',
          (s) => Effect.succeed(s.pattern.refusals),
        ),
        Then('the composed pattern carries the band refusal')(({ refusals }, expect) =>
          expect(refusals).toMatchObject([{ threshold: 'miss', value: 0.8, limit: 0.5 }])
        ),
      ),
    )

    scenario(
      'A refused leaf stays refused under not',
      Gherkin.Do.pipe(
        Given('a negated crossed band')('pattern', () => Effect.succeed(Discern.not(crossedBand))),
        When('the negated pattern is built and its refusals are read')(
          'refusals',
          (s) => Effect.succeed(s.pattern.refusals),
        ),
        Then('the negated pattern carries the band refusal')(({ refusals }, expect) =>
          expect(refusals).toMatchObject([{ threshold: 'miss', value: 0.8, limit: 0.5 }])
        ),
      ),
    )

    Arr.forEach(refusedPatterns, (refused) => {
      Arr.forEach([
        { label: 'labelled examples', examples: twoExamples },
        { label: 'no examples', examples: [] },
      ], (given) => {
        scenario(
          `Evaluating ${refused.name} over ${given.label} is refused before the model is asked`,
          Gherkin.Do.pipe(
            Given('a pattern that cannot judge')('pattern', () => Effect.succeed(refused.build())),
            When('the pattern is evaluated over the examples')(
              'outcome',
              (s) => refusedAfterAsking(Discern.Eval.run(Schema.String, s.pattern, given.examples)),
            ),
            Then('the evaluation is refused, and the model is never asked')(({ outcome }, expect) =>
              expect(outcome).toMatchObject({ outcome: refused.refusal, asked: 0 })
            ),
          ),
        )
      })
    })

    scenario(
      'Sweeping a valid candidate and then an inverted one is refused before the model is asked',
      Gherkin.Do.pipe(
        Given('labelled examples and a sweep of miss bounds from 0.3 to 0.8 under a 0.5 threshold')(
          'examples',
          () => Effect.succeed(twoExamples),
        ),
        When('the miss bounds are swept')('outcome', (s) =>
          refusedAfterAsking(Discern.Eval.sweep({
            schema: Schema.String,
            values: [0.3, 0.8],
            pattern: (missBelow: number) => risk.above(0.5, { missBelow }),
            examples: s.examples,
          }))),
        Then('the sweep is refused naming the inverted bound, and the model is never asked')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            outcome: { _tag: 'InvalidThresholdError', value: 0.8, limit: 0.5 },
            asked: 0,
          })
        ),
      ),
    )

    scenario(
      'Sweeping an inverted candidate over no examples is still refused',
      Gherkin.Do.pipe(
        Given('a sweep of miss bounds from 0.3 to 0.8 under a 0.5 threshold with no examples')(
          'examples',
          () => Effect.succeed<ReadonlyArray<Discern.EvalExample<string>>>([]),
        ),
        When('the miss bounds are swept')('outcome', (s) =>
          refusedAfterAsking(Discern.Eval.sweep({
            schema: Schema.String,
            values: [0.3, 0.8],
            pattern: (missBelow: number) => risk.above(0.5, { missBelow }),
            examples: s.examples,
          }))),
        Then('the sweep is refused naming the inverted bound, and the model is never asked')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            outcome: { _tag: 'InvalidThresholdError', value: 0.8, limit: 0.5 },
            asked: 0,
          })
        ),
      ),
    )

    scenario(
      'Calibrating a plain candidate and then an inverted one is refused before the model is asked',
      Gherkin.Do.pipe(
        Given('labelled examples and two candidates, the second with a miss bound past its threshold')(
          'examples',
          () => Effect.succeed(twoExamples),
        ),
        When('the candidates are calibrated')('outcome', (s) =>
          refusedAfterAsking(Discern.Eval.calibrate({
            schema: Schema.String,
            values: [0.5, 0.7],
            pattern: (value: number) => value === 0.5 ? risk.atLeast(value) : risk.above(0.5, { missBelow: 0.8 }),
            examples: s.examples,
          }))),
        Then('the calibration is refused naming the inverted bound, and the model is never asked')(
          ({ outcome }, expect) =>
            expect(outcome).toMatchObject({
              outcome: { _tag: 'InvalidThresholdError', value: 0.8, limit: 0.5 },
              asked: 0,
            }),
        ),
      ),
    )

    scenario(
      'Evaluating a refused probability pattern directly answers uncertain with the refusal message',
      Gherkin.Do.pipe(
        Given('a pattern whose miss bound sits past its threshold')(
          'pattern',
          () => Effect.succeed(risk.above(0.5, { missBelow: 0.8 })),
        ),
        When('it is evaluated against an answer that would clear the threshold')(
          'result',
          (s) => Effect.succeed(Discern.evaluate(s.pattern, 'change', probabilityAnswers(0.99))),
        ),
        Then('the answer is uncertain and carries the refusal message')(({ pattern, result }, expect) =>
          expect({ status: Discern.statusOf(result), reasons: [Discern.reasonOf(result)] }).toEqual({
            status: 'Uncertain',
            reasons: Arr.map(pattern.refusals, (refusal) => refusal.message),
          })
        ),
      ),
    )

    scenario(
      'A miss bound of infinity builds without a refusal and runs as it always has',
      Gherkin.Do.pipe(
        Given('a policy whose pattern has an unbounded miss bound')(
          'pattern',
          () => Effect.succeed(risk.above(0.5, { missBelow: Number.POSITIVE_INFINITY })),
        ),
        When('a change is judged')('run', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const verdict = yield* withProvider(policyOf(s.pattern)('change'), model.model)
            return { refusals: s.pattern.refusals, verdict, asked: model.calls() }
          })),
        Then('the pattern carries no refusal and the run decides after one model round trip')(({ run }, expect) =>
          expect(run).toEqual({ refusals: [], verdict: 'matched', asked: 1 })
        ),
      ),
    )
  })
