import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Predicate, Schema } from 'effect'
import type * as DecisionModel from 'effect/ai/DecisionModel'
import {
  type AnswerFor,
  answering,
  answersFor,
  CountingModel,
  probabilityAnswer,
  probabilityEverywhere,
  tally,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

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

// The untyped-caller boundary. Calibrate's type refuses an empty tuple — that compile-time
// refusal is the typed caller's contract, already pinned in test-types. This boundary reads
// the entry dynamically, so the runtime refusal an untyped caller must meet can be
// exercised. No check is silenced: the scenarios through this shim fail today and pass
// only when the runtime guard exists.
type CalibrateArgs = {
  readonly schema: typeof Schema.String
  readonly values: ReadonlyArray<number>
  readonly pattern: (threshold: number) => Discern.Pattern<string>
  readonly examples: ReadonlyArray<{ readonly input: string; readonly expected: boolean }>
}
type CalibrateOutcome = Effect.Effect<
  { readonly best: Discern.SweepResult<number>; readonly results: ReadonlyArray<Discern.SweepResult<number>> },
  Discern.MeasureError,
  DecisionModel.DecisionModel
>

const isCalibrateEntry = (
  candidate: unknown,
): candidate is (this: undefined, args_0: CalibrateArgs) => CalibrateOutcome => Predicate.isFunction(candidate)

const calibrateUntyped = (
  values: ReadonlyArray<number>,
  pattern: (threshold: number) => Discern.Pattern<string>,
  examples: ReadonlyArray<{ readonly input: string; readonly expected: boolean }>,
): CalibrateOutcome => {
  const surface: object = Discern.Eval
  if (!Predicate.hasProperty(surface, 'calibrate')) {
    return Effect.die(new Error('Discern.Eval.calibrate is missing from the public surface'))
  }
  if (!isCalibrateEntry(surface.calibrate)) {
    return Effect.die(new Error('Discern.Eval.calibrate is not the entry the boundary expects'))
  }
  return Reflect.apply<undefined, [CalibrateArgs], CalibrateOutcome>(
    surface.calibrate,
    undefined,
    [{ schema: Schema.String, values, pattern, examples }],
  )
}

const answersWithTheExampleProbability: AnswerFor = (request) =>
  answersFor({ request, answerOf: () => probabilityAnswer(Number(request.state)) })

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
        Then('each example was asked once and the middle threshold is perfect')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              modelCalls: model.calls(),
              bestValue: s.result.best.value,
              bestF1: s.result.best.report.metrics.f1,
            }
          }).pipe(
            Effect.map((answer) =>
              expect(answer).toEqual({ modelCalls: s.examples.length, bestValue: 0.7, bestF1: 1 })
            ),
          )
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
        Then('only the guarded-in file was asked, and every threshold scores perfectly')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              modelCalls: model.calls(),
              scores: Arr.map(s.results, (entry) => [entry.value, entry.report.metrics.accuracy]),
            }
          }).pipe(Effect.map((answer) => expect(answer).toEqual({ modelCalls: 1, scores: [[0.5, 1], [0.9, 1]] })))
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
        Then('the unknown outcome is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["status"\]/) },
          })
        ),
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
        Then('the non-finite number is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["f1"\]/) },
          })
        ),
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
        Then('the incomplete record is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["coverage"\]/) },
          })
        ),
      ),
    )

    scenario(
      'Calibrating with no candidate values is refused before any pattern is built',
      Gherkin.Do.pipe(
        Given('labelled examples and a pattern builder that counts every value it is given')(
          'setup',
          () => Effect.succeed({ examples: labelledExamples, built: tally() }),
        ),
        When('an empty list of thresholds is calibrated')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* Effect.flip(
                withProvider(
                  calibrateUntyped(
                    [],
                    (threshold) => {
                      s.setup.built.bump()
                      return sweepRisk.atLeast(threshold)
                    },
                    s.setup.examples,
                  ),
                  model.model,
                ),
              )
            }),
        ),
        Then('the calibration is refused as having no values and no pattern was built')((s, expect) =>
          expect({ refusal: s.outcome._tag, patternsBuilt: s.setup.built.count() }).toEqual({
            refusal: 'CalibrationValuesRefused',
            patternsBuilt: 0,
          })
        ),
      ),
    )

    scenario(
      'Calibrating with no candidate values never asks the model',
      Gherkin.Do.pipe(
        Given('labelled examples')('examples', () => Effect.succeed(labelledExamples)),
        When('an empty list of thresholds is calibrated')(
          'asked',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              yield* Effect.exit(
                withProvider(
                  calibrateUntyped([], (threshold) => sweepRisk.atLeast(threshold), s.examples),
                  model.model,
                ),
              )
              return model.calls()
            }),
        ),
        Then('the model was asked nothing')(({ asked }, expect) => expect(asked).toBe(0)),
      ),
    )

    scenario(
      'Calibrating with one candidate value returns it as the best',
      Gherkin.Do.pipe(
        Given('labelled examples')('examples', () => Effect.succeed(labelledExamples)),
        When('a single threshold is calibrated')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* withProvider(
                Discern.Eval.calibrate({
                  schema: Schema.String,
                  values: [0.7],
                  pattern: (threshold) => sweepRisk.atLeast(threshold),
                  examples: s.examples,
                }),
                model.model,
              )
            }),
        ),
        Then('that threshold is the best and the only result')(({ result }, expect) =>
          expect({ bestValue: result.best.value, resultCount: result.results.length }).toEqual({
            bestValue: 0.7,
            resultCount: 1,
          })
        ),
      ),
    )
  })
