import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Result, Schema } from 'effect'
import { expect } from 'vitest'
import {
  type AnswerFor,
  answering,
  answersFor,
  CountingModel,
  probabilityAnswer,
  probabilityEverywhere,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it, layer })

const Change = Discern.on(Schema.String)

const sweepRisk = Change.probability({ id: 'risk', instructions: 'Risky' })

const endsWithTs = (path: string): boolean => path.endsWith('.ts')
const sourceOnly = Discern.deterministic(endsWithTs, { id: 'source' })

const sweepPattern = (threshold: number) => Discern.and(sourceOnly, sweepRisk.atLeast(threshold))

const labelledExamples = [
  { input: '0.95', expected: true },
  { input: '0.80', expected: true },
  { input: '0.55', expected: false },
  { input: '0.10', expected: false },
]

const guardableExamples = [
  { input: 'a.ts', expected: true },
  { input: 'b.md', expected: false },
  { input: 'c.md', expected: false },
]

const answersWithTheExampleProbability: AnswerFor = (request) =>
  answersFor(request, () => probabilityAnswer(Number(request.state)))

Feature('Measuring a question against labelled examples')
  .withScenarioLayer(answering(answersWithTheExampleProbability))
  .body(({ scenario }) => {
    scenario(
      'A threshold sweep asks each example once and picks the threshold that separates them',
      Gherkin.Do.pipe(
        Given('labelled examples from clearly risky to clearly safe')(
          'examples',
          () => Effect.succeed(labelledExamples),
        ),
        When('the thresholds zero point five, zero point seven, and zero point nine are calibrated')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* withProvider(
                Discern.Eval.calibrate({
                  schema: Schema.String,
                  values: [0.5, 0.7, 0.9],
                  pattern: (threshold) => sweepRisk.atLeast(threshold),
                  examples: s.examples,
                  metric: 'f1',
                }),
                model.model,
              )
            }),
        ),
        Then('each example was asked once and the middle threshold is perfect')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(model.calls()).toBe(s.examples.length)
            expect(s.result.best.value).toBe(0.7)
            expect(s.result.best.report.metrics.f1).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'A sweep skips the examples a deterministic guard already settles',
      { scenarioLayer: answering(probabilityEverywhere(0.9)) },
      Gherkin.Do.pipe(
        Given('examples where only one file needs an opinion about risk')(
          'examples',
          () => Effect.succeed(guardableExamples),
        ),
        When('the thresholds zero point five and zero point nine are swept behind a source-file guard')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* withProvider(
                Discern.Eval.sweep({
                  schema: Schema.String,
                  values: [0.5, 0.9],
                  pattern: sweepPattern,
                  examples: s.examples,
                }),
                model.model,
              )
            }),
        ),
        Then('only the guarded-in file was asked, and every threshold scores perfectly')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(model.calls()).toBe(1)
            expect(Arr.map(s.results, (entry) => [entry.value, entry.report.metrics.accuracy])).toStrictEqual([
              [0.5, 1],
              [0.9, 1],
            ])
          })
        ),
      ),
    )

    scenario(
      'A measurement record resolved to an unrecorded outcome is refused',
      Gherkin.Do.pipe(
        Given('a measurement record claiming an outcome no measurement can reach')(
          'payload',
          () => Effect.succeed({ input: 'x', expected: true, status: 'Maybe' }),
        ),
        When('the measurement record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.EvalRecord)(s.payload)),
        ),
        Then('the unknown outcome is refused')(({ outcome }) => {
          expect(Result.isFailure(outcome)).toBe(true)
        }),
      ),
    )

    scenario(
      'A metrics record whose number is not finite is refused',
      Gherkin.Do.pipe(
        Given('a complete metrics record whose balance is not a finite number')('payload', () =>
          Effect.succeed({
            total: 1,
            decided: 1,
            uncertain: 0,
            coverage: 1,
            correct: 1,
            accuracy: 1,
            selectiveAccuracy: 1,
            truePositive: 1,
            falsePositive: 0,
            trueNegative: 0,
            falseNegative: 0,
            precision: 1,
            recall: 1,
            f1: Number.NaN,
          })),
        When('the metrics record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeResult(Discern.EvalMetrics)(s.payload)),
        ),
        Then('the non-finite number is refused')(({ outcome }) => {
          expect(Result.isFailure(outcome)).toBe(true)
        }),
      ),
    )

    scenario(
      'A metrics record missing one of its numbers is refused',
      Gherkin.Do.pipe(
        Given('a metrics record that stops after the totals')(
          'payload',
          () => Effect.succeed({ total: 1, decided: 1, uncertain: 0 }),
        ),
        When('the metrics record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.EvalMetrics)(s.payload)),
        ),
        Then('the incomplete record is refused')(({ outcome }) => {
          expect(Result.isFailure(outcome)).toBe(true)
        }),
      ),
    )
  })
