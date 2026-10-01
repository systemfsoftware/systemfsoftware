import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Option, Order, Result, Schema } from 'effect'
import type * as AiError from 'effect/ai/AiError'
import type * as DecisionModel from 'effect/ai/DecisionModel'
import { observe } from './decision.blueprint.js'
import {
  DecisionIdCollisionError,
  InvalidThresholdError,
  MeasureCommandRejected,
  MeasureInputRefused,
} from './DiscernError.schema.js'
import { EvalRecord, EvalReport, metricsOf } from './EvalReport.schema.js'
import type { CalibrateOptions, EvalExample, MeasureError, SweepOptions, SweepResult } from './measure-pattern.cell.js'
import type { Answers, Pattern, PatternRefusal, Preview } from './pattern.blueprint.js'
import { evaluate, preview } from './pattern.blueprint.js'
import { ScoreEvalRecord, scoreEvalRecord } from './score-eval-record.workflow.js'
import type { EvalScore } from './score-eval-record.workflow.js'
import { statusOf } from './Verdict.schema.js'
import type { PatternResult } from './Verdict.schema.js'

/**
 * The measure case one sandwich run evaluates: the deterministic preview, the
 * encoded input or the refusal that could not encode it, the pattern's own
 * refusals, and the closure that answers the run once observations are in.
 */
export interface MeasureCase<S extends Schema.Constraint> {
  readonly preview: Preview
  readonly expected: boolean
  readonly inputJson: Result.Result<Schema.Json, Schema.SchemaError>
  readonly refusals: ReadonlyArray<PatternRefusal>
  readonly evaluate: (answers: Answers) => PatternResult
  readonly observe: Effect.Effect<
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
      Effect.map(measure.observe, (answers) => {
        const result = resolvedOrEvaluated(measure, answers)
        const status = statusOf(result)
        return {
          _tag: 'ScoreEvalRecord' as const,
          expected: measure.expected,
          status,
          record: EvalRecord.make({ input: json, expected: measure.expected, status }),
        }
      })),
  )

const recordOf = (_score: (typeof EvalScore)['Encoded'], read: MeasureRead): Effect.Effect<EvalRecord> =>
  Effect.succeed(read.record)

/** Run one sandwich for one measure case and answer its record. */
export const measureOf = <S extends Schema.Constraint>(
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

/** Build the measure case one labelled example contributes to one pattern's run. */
export const measureCaseOf = <S extends Schema.Constraint>(gathered: {
  readonly schema: S
  readonly pattern: Pattern<S['Type']>
  readonly example: EvalExample<S['Type']>
}): MeasureCase<S> => {
  const deterministic = preview(gathered.pattern, gathered.example.input)
  return {
    preview: deterministic,
    expected: gathered.example.expected,
    inputJson: Schema.encodeUnknownResult(Schema.Json)(gathered.example.input),
    refusals: gathered.pattern.refusals,
    evaluate: (answers) => evaluate(gathered.pattern, gathered.example.input, answers),
    observe: observe(gathered.schema, deterministic.decisions, gathered.example.input),
  }
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
    observe: answered.answers,
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
      (records) => ({ value: candidate.value, report: EvalReport.make({ metrics: metricsOf(records), records }) }),
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
