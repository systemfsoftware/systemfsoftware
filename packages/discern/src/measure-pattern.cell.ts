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
import { observe } from './decision.blueprint.js'
import {
  DecisionIdCollisionError,
  InvalidThresholdError,
  MeasureCommandRejected,
  MeasureInputRefused,
} from './DiscernError.schema.js'
import { EvalMetrics, EvalRecord, EvalReport } from './EvalReport.schema.js'
import type { Answers, Pattern, PatternRefusal, Preview } from './pattern.blueprint.js'
import { evaluate, preview, statusOf } from './pattern.blueprint.js'
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

/** Everything that can refuse one measurement: the model, the batch build, the pattern, or the example itself. */
export type MeasureError =
  | AiError.AiError
  | DecisionIdCollisionError
  | InvalidThresholdError
  | MeasureCommandRejected
  | MeasureInputRefused

// -------------------------------------------------------------------------------------------------
// The measure case: what one sandwich run evaluates
// -------------------------------------------------------------------------------------------------

interface MeasureCase<S extends Schema.Constraint> {
  readonly preview: Preview
  readonly expected: boolean
  readonly inputJson: Result.Result<Schema.Json, Schema.SchemaError>
  readonly refusals: ReadonlyArray<PatternRefusal>
  readonly evaluate: (answers: Answers) => PatternResult
  readonly observe: () => Effect.Effect<
    Answers,
    AiError.AiError | DecisionIdCollisionError,
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

/**
 * A measure's refusals refuse it before anything is observed: each one fails
 * the read with the refusal it names, and the first one written is the one
 * reported.
 */
const refusalGate = (refusals: ReadonlyArray<PatternRefusal>): Effect.Effect<void, InvalidThresholdError> =>
  Arr.reduce<PatternRefusal, Effect.Effect<void, InvalidThresholdError>>(
    refusals,
    Effect.void,
    (gate, refusal) => Effect.andThen(gate, Effect.fail(new InvalidThresholdError(refusal))),
  )

/** The example's encoded input, or the refusal naming what could not be encoded. */
const encodedInputOf = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
): Effect.Effect<Schema.Json, MeasureInputRefused> =>
  Effect.mapError(
    Effect.fromResult(measure.inputJson),
    (issue) => new MeasureInputRefused({ expected: measure.expected, cause: issue }),
  )

const readMeasure = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
): Effect.Effect<
  MeasureRead,
  Exclude<MeasureError, MeasureCommandRejected>,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.andThen(
    refusalGate(measure.refusals),
    Effect.flatMap(encodedInputOf(measure), (json) =>
      Effect.map(measure.observe(), (answers) => {
        const result = resolvedOrEvaluated(measure, answers)
        const status = statusOf(result)
        return {
          _tag: 'ScoreEvalRecord' as const,
          expected: measure.expected,
          status,
          record: new EvalRecord({ input: json, expected: measure.expected, status }),
        }
      })),
  )

const recordOf = (_score: (typeof EvalScore)['Encoded'], read: MeasureRead): Effect.Effect<EvalRecord> =>
  Effect.succeed(read.record)

/** Run one sandwich for one measure case and answer its record. */
const measureOf = <S extends Schema.Constraint>(
  measure: MeasureCase<S>,
): Effect.Effect<
  EvalRecord,
  MeasureError,
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
      CommandRejected: (rejected, read) =>
        Effect.fail(new MeasureCommandRejected({ record: read.record, cause: rejected })),
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
  const deterministic = preview(pattern, example.input)
  return {
    preview: deterministic,
    expected: example.expected,
    inputJson: Schema.encodeUnknownResult(Schema.Json)(example.input),
    refusals: pattern.refusals,
    evaluate: (answers) => evaluate(pattern, example.input, answers),
    observe: () => observe(schema, deterministic.decisions, example.input),
  }
}

/** Evaluate one semantic pattern over labeled examples. */
export const run: {
  <S extends Schema.Constraint>(
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): (schema: S) => Effect.Effect<EvalReport, MeasureError, DecisionModel.DecisionModel | S['EncodingServices']>
  <S extends Schema.Constraint>(
    schema: S,
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): Effect.Effect<EvalReport, MeasureError, DecisionModel.DecisionModel | S['EncodingServices']>
} = dual(
  3,
  <S extends Schema.Constraint>(
    schema: S,
    pattern: Pattern<S['Type']>,
    examples: ReadonlyArray<EvalExample<S['Type']>>,
  ): Effect.Effect<EvalReport, MeasureError, DecisionModel.DecisionModel | S['EncodingServices']> =>
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

/** One example joined to the observation batch cached for it. */
interface AnsweredExample<S extends Schema.Constraint, I> {
  readonly example: EvalExample<I>
  readonly answers: Effect.Effect<
    Answers,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
}

const measureSweepCaseOf = <S extends Schema.Constraint, V>(
  candidate: { readonly value: V; readonly pattern: Pattern<S['Type']> },
  answered: AnsweredExample<S, S['Type']>,
): MeasureCase<S> => {
  const deterministic = preview(candidate.pattern, answered.example.input)
  return {
    preview: deterministic,
    expected: answered.example.expected,
    inputJson: Schema.encodeUnknownResult(Schema.Json)(answered.example.input),
    refusals: candidate.pattern.refusals,
    evaluate: (observed) => evaluate(candidate.pattern, answered.example.input, observed),
    observe: () => answered.answers,
  }
}

const candidatesOf = <S extends Schema.Constraint, V>(
  options: SweepOptions<S, V>,
): ReadonlyArray<{ readonly value: V; readonly pattern: Pattern<S['Type']> }> =>
  Arr.map(options.values, (value) => ({ value, pattern: options.pattern(value) }))

const answeredExamplesOf = <S extends Schema.Constraint, V>(
  options: SweepOptions<S, V>,
  candidates: ReadonlyArray<{ readonly value: V; readonly pattern: Pattern<S['Type']> }>,
): Effect.Effect<
  ReadonlyArray<AnsweredExample<S, S['Type']>>,
  MeasureError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.forEach(options.examples, (example) =>
    Effect.map(
      Effect.cached(observe(
        options.schema,
        Arr.flatMap(candidates, (candidate) => preview(candidate.pattern, example.input).decisions),
        example.input,
      )),
      (answers) => ({ example, answers }),
    ))

const scoreCandidate =
  <S extends Schema.Constraint>(answeredExamples: ReadonlyArray<AnsweredExample<S, S['Type']>>) =>
  <V>(
    candidate: { readonly value: V; readonly pattern: Pattern<S['Type']> },
  ): Effect.Effect<SweepResult<V>, MeasureError, DecisionModel.DecisionModel | S['EncodingServices']> =>
    Effect.map(
      Effect.forEach(answeredExamples, (answered) => measureOf(measureSweepCaseOf(candidate, answered))),
      (records) => ({ value: candidate.value, report: new EvalReport({ metrics: metricsOf(records), records }) }),
    )

/**
 * Sweep a parameterized pattern. All candidate patterns share one semantic
 * observation batch per example, cached so the model is asked once per
 * example; thresholds are replayed deterministically against it.
 */
export const sweep = <S extends Schema.Constraint, V>(
  options: SweepOptions<S, V>,
): Effect.Effect<ReadonlyArray<SweepResult<V>>, MeasureError, DecisionModel.DecisionModel | S['EncodingServices']> =>
  Effect.gen(function*() {
    const candidates = candidatesOf(options)
    const answeredExamples = yield* answeredExamplesOf(options, candidates)
    return yield* Effect.forEach(candidates, scoreCandidate(answeredExamples))
  })

type MetricName = 'f1' | 'accuracy' | 'selectiveAccuracy' | 'coverage'

const metricValueOf = <V>(entry: SweepResult<V>, metric: MetricName): number => entry.report.metrics[metric]

const metricOrderOf = <V>(metric: MetricName): Order.Order<SweepResult<V>> =>
  Order.flip(Order.mapInput(Order.Number, (entry: SweepResult<V>) => metricValueOf(entry, metric)))

/** Prefer the higher metric; ties go to the higher coverage. */
const bestOrderOf = <V>(metric: 'f1' | 'accuracy' | 'selectiveAccuracy'): Order.Order<SweepResult<V>> =>
  Order.combine(metricOrderOf<V>(metric), metricOrderOf<V>('coverage'))

/** Prefer the higher metric; ties keep the earlier candidate, as a stable ranking would. */
const betterOf = <V>(
  metric: 'f1' | 'accuracy' | 'selectiveAccuracy',
  best: SweepResult<V>,
  next: SweepResult<V>,
): SweepResult<V> => Order.min(bestOrderOf<V>(metric))(best, next)

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
  MeasureError,
  DecisionModel.DecisionModel | S['EncodingServices']
> =>
  Effect.gen(function*() {
    const candidates = candidatesOf(options)
    const answeredExamples = yield* answeredExamplesOf(options, candidates)
    const score = scoreCandidate(answeredExamples)
    const [firstValue, ...restValues] = options.values
    const first = yield* score<V>({ value: firstValue, pattern: options.pattern(firstValue) })
    const rest = yield* Effect.forEach(restValues, (value: V) => score<V>({ value, pattern: options.pattern(value) }))
    const results: ReadonlyArray<SweepResult<V>> = [first, ...rest]
    return { best: Arr.reduce(rest, first, (best, next) => betterOf(options.metric ?? 'f1', best, next)), results }
  })

/** The evaluation entry point: run one pattern, sweep thresholds, or calibrate. */
export const Eval = {
  run,
  sweep,
  calibrate,
} as const
