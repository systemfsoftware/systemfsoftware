/**
 * Evaluation: scoring semantic patterns over labelled examples.
 *
 * One `discern.eval.measure` sandwich decides each record with the
 * `score-eval-record` workflow. `read` resolves the pattern for one example —
 * asking the model only for the decisions the pattern's structure still needs —
 * and `write` answers the record for the branch the workflow chose. A sweep
 * shares one cached observation per example across every candidate threshold.
 */
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Match, Option, Order, Result, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { observe } from './decision.resource.js'
import { EvalMetrics, EvalRecord, EvalReport } from './EvalReport.schema.js'
import type { Answers, Pattern, Preview } from './pattern.resource.js'
import { statusOf } from './pattern.resource.js'
import { ScoreEvalRecord, scoreEvalRecord } from './score-eval-record.workflow.js'
import type { EvalScore } from './score-eval-record.workflow.js'
import type { PatternResult } from './Verdict.schema.js'

/** One labelled example: the input, whether the pattern should match, and an optional id. */
export interface EvalExample<Input> {
  readonly input: Input
  readonly expected: boolean
  readonly id?: string | undefined
}

/** One swept candidate: the threshold value and the report it produced. */
export interface SweepResult<Value> {
  readonly value: Value
  readonly report: EvalReport
}

// -------------------------------------------------------------------------------------------------
// The measure case: what one sandwich run evaluates
// -------------------------------------------------------------------------------------------------

interface MeasureCase<S extends Schema.Constraint> {
  readonly preview: Preview
  readonly expected: boolean
  readonly inputJson: Result.Result<Schema.Json, Schema.SchemaError>
  readonly evaluate: (answers: Answers) => PatternResult
  readonly observe: () => Effect.Effect<
    Answers,
    AiError.AiError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
}

const resolvedOrEvaluated = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
  answers: Answers,
): PatternResult => Option.getOrElse(Option.fromNullishOr(measure.preview.resolved), () => measure.evaluate(answers))

type MeasureRead = (typeof ScoreEvalRecord)['Encoded'] & {
  readonly record: EvalRecord
}

const readMeasure = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
): Effect.Effect<MeasureRead, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']> =>
  Result.match(measure.inputJson, {
    onFailure: (issue) => Effect.die(issue),
    onSuccess: (json) =>
      Effect.map(measure.observe(), (answers) => {
        const result = resolvedOrEvaluated(measure, answers)
        const status = statusOf(result)
        return {
          _tag: 'ScoreEvalRecord',
          expected: measure.expected,
          status,
          record: new EvalRecord({ input: json, expected: measure.expected, status }),
        }
      }),
  })

const recordOf = (_score: (typeof EvalScore)['Encoded'], read: MeasureRead): Effect.Effect<EvalRecord> =>
  Effect.succeed(read.record)

/** Run one sandwich for one measure case and answer its record. */
const measureOf = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
): Effect.Effect<
  EvalRecord,
  AiError.AiError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Sandwich.named('discern.eval.measure')((input: MeasureCase<S>) => readMeasure(input))
    .decide(scoreEvalRecord)
    .write({
      TruePositive: recordOf,
      FalsePositive: recordOf,
      TrueNegative: recordOf,
      FalseNegative: recordOf,
      Abstained: recordOf,
      CommandRejected: (rejected, _read) => Effect.die(rejected),
    })
    .run(measure)

// -------------------------------------------------------------------------------------------------
// Metrics
// -------------------------------------------------------------------------------------------------

interface Tally {
  readonly uncertain: number
  readonly correct: number
  readonly truePositive: number
  readonly falsePositive: number
  readonly trueNegative: number
  readonly falseNegative: number
}

const emptyTally: Tally = {
  uncertain: 0,
  correct: 0,
  truePositive: 0,
  falsePositive: 0,
  trueNegative: 0,
  falseNegative: 0,
}

const matchTallyOf = (tally: Tally, expected: boolean): Tally =>
  Match.value(expected).pipe(
    Match.when(true, () => ({ ...tally, correct: tally.correct + 1, truePositive: tally.truePositive + 1 })),
    Match.when(false, () => ({ ...tally, falsePositive: tally.falsePositive + 1 })),
    Match.exhaustive,
  )

const missTallyOf = (tally: Tally, expected: boolean): Tally =>
  Match.value(expected).pipe(
    Match.when(true, () => ({ ...tally, falseNegative: tally.falseNegative + 1 })),
    Match.when(false, () => ({ ...tally, correct: tally.correct + 1, trueNegative: tally.trueNegative + 1 })),
    Match.exhaustive,
  )

const stepTally = (tally: Tally, record: EvalRecord): Tally =>
  Match.value(record.status).pipe(
    Match.when('Uncertain', () => ({ ...tally, uncertain: tally.uncertain + 1 })),
    Match.when('Match', () => matchTallyOf(tally, record.expected)),
    Match.when('Miss', () => missTallyOf(tally, record.expected)),
    Match.exhaustive,
  )

const ratioOf = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole)

/** The reference metrics: coverage, accuracy, selective accuracy, precision, recall, f1. */
const metricsOf = (records: ReadonlyArray<EvalRecord>): EvalMetrics => {
  const tally = Arr.reduce(records, emptyTally, stepTally)
  const total = records.length
  const decided = total - tally.uncertain
  const precision = ratioOf(tally.truePositive, tally.truePositive + tally.falsePositive)
  const recall = ratioOf(tally.truePositive, tally.truePositive + tally.falseNegative)
  return new EvalMetrics({
    total,
    decided,
    uncertain: tally.uncertain,
    coverage: ratioOf(decided, total),
    correct: tally.correct,
    accuracy: ratioOf(tally.correct, total),
    selectiveAccuracy: ratioOf(tally.correct, decided),
    truePositive: tally.truePositive,
    falsePositive: tally.falsePositive,
    trueNegative: tally.trueNegative,
    falseNegative: tally.falseNegative,
    precision,
    recall,
    f1: ratioOf(2 * precision * recall, precision + recall),
  })
}

// -------------------------------------------------------------------------------------------------
// Eval
// -------------------------------------------------------------------------------------------------

const measureCaseOf = <S extends Schema.Constraint>(
  schema: S,
  pattern: Pattern<S['Type']>,
  example: EvalExample<S['Type']>,
): MeasureCase<S> => {
  const preview = pattern.preview(example.input)
  return {
    preview,
    expected: example.expected,
    inputJson: Schema.encodeUnknownResult(Schema.Json)(example.input),
    evaluate: (answers) => pattern.evaluate(example.input, answers),
    observe: () => observe(schema, preview.decisions, example.input),
  }
}

/** Evaluate one semantic pattern over labeled examples. */
export const run: {
  <S extends Schema.Constraint>(
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): (
    schema: S,
  ) => Effect.Effect<EvalReport, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
  <S extends Schema.Constraint>(
    schema: S,
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): Effect.Effect<EvalReport, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
} = dual(
  3,
  <S extends Schema.Constraint>(
    schema: S,
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): Effect.Effect<EvalReport, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']> =>
    Effect.map(
      Effect.forEach(examples, (example) => measureOf(measureCaseOf(schema, pattern, example))),
      (records) => new EvalReport({ metrics: metricsOf(records), records }),
    ),
)

/** Options for a threshold sweep: one pattern per candidate value over shared examples. */
export interface SweepOptions<S extends Schema.Constraint, V> {
  readonly schema: S
  readonly values: ReadonlyArray<V>
  readonly pattern: (value: V) => Pattern<S['Type']>
  readonly examples: ReadonlyArray<EvalExample<S['Type']>>
}

const measureSweepCaseOf = <S extends Schema.Constraint, V>(
  options: SweepOptions<S, V>,
  candidate: { readonly value: V; readonly pattern: Pattern<S['Type']> },
  cachedAnswers: ReadonlyArray<
    Effect.Effect<Answers, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
  >,
  example: EvalExample<S['Type']>,
  exampleIndex: number,
): MeasureCase<S> => {
  const preview = candidate.pattern.preview(example.input)
  const answers = Option.getOrThrow(Arr.get(cachedAnswers, exampleIndex))
  return {
    preview,
    expected: example.expected,
    inputJson: Schema.encodeUnknownResult(Schema.Json)(example.input),
    evaluate: (observed) => candidate.pattern.evaluate(example.input, observed),
    observe: () => answers,
  }
}

/**
 * Sweep a parameterized pattern. All candidate patterns share one semantic
 * observation batch per example, cached so the model is asked once per
 * example; thresholds are replayed deterministically against it.
 */
export const sweep = <S extends Schema.Constraint, V>(
  options: SweepOptions<S, V>,
): Effect.Effect<
  ReadonlyArray<SweepResult<V>>,
  AiError.AiError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.gen(function*() {
    const candidates = Arr.map(options.values, (value) => ({ value, pattern: options.pattern(value) }))
    const cachedAnswers = yield* Effect.forEach(options.examples, (example) =>
      Effect.cached(observe(
        options.schema,
        Arr.flatMap(candidates, (candidate) => candidate.pattern.preview(example.input).decisions),
        example.input,
      )))
    return yield* Effect.forEach(candidates, (candidate) =>
      Effect.map(
        Effect.forEach(
          options.examples,
          (example, exampleIndex) =>
            measureOf(measureSweepCaseOf(options, candidate, cachedAnswers, example, exampleIndex)),
        ),
        (records) => ({ value: candidate.value, report: new EvalReport({ metrics: metricsOf(records), records }) }),
      ))
  })

type MetricName = 'f1' | 'accuracy' | 'selectiveAccuracy' | 'coverage'

const metricValueOf = <V>(entry: SweepResult<V>, metric: MetricName): number => entry.report.metrics[metric]

const metricOrderOf = <V>(metric: MetricName): Order.Order<SweepResult<V>> =>
  Order.flip(Order.mapInput(Order.Number, (entry: SweepResult<V>) => metricValueOf(entry, metric)))

/** Prefer the higher metric; ties go to the higher coverage. */
const bestOrderOf = <V>(metric: 'f1' | 'accuracy' | 'selectiveAccuracy'): Order.Order<SweepResult<V>> =>
  Order.combine(metricOrderOf<V>(metric), metricOrderOf<V>('coverage'))

/** Options for calibrating: a sweep over at least one candidate value. */
export interface CalibrateOptions<S extends Schema.Constraint, V> extends Omit<SweepOptions<S, V>, 'values'> {
  readonly values: readonly [V, ...Array<V>]
  readonly metric?: 'f1' | 'accuracy' | 'selectiveAccuracy' | undefined
}

/** Select the best sweep value by a metric, preferring higher coverage on ties. */
export const calibrate = <S extends Schema.Constraint, V>(
  options: CalibrateOptions<S, V>,
): Effect.Effect<
  { readonly best: SweepResult<V>; readonly results: ReadonlyArray<SweepResult<V>> },
  AiError.AiError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.map(sweep(options), (results) => ({
    best: Option.getOrThrow(Arr.head(Arr.sort(results, bestOrderOf<V>(options.metric ?? 'f1')))),
    results,
  }))

/** The evaluation entry point: run one pattern, sweep thresholds, or calibrate. */
export const Eval = {
  run,
  sweep,
  calibrate,
} as const
