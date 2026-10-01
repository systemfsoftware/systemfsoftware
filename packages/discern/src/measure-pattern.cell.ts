/**
 * Evaluation: scoring semantic patterns over labelled examples.
 *
 * One `discern.eval.measure` sandwich decides each record with the
 * `score-eval-record` workflow. `read` resolves the pattern for one example —
 * asking the model only for the decisions the pattern's structure still needs —
 * and `write` answers the record for the branch the workflow chose. A sweep
 * shares one cached observation per example across every candidate threshold.
 */
import { Effect, Schema } from 'effect'
import type * as AiError from 'effect/ai/AiError'
import type * as DecisionModel from 'effect/ai/DecisionModel'
import { dual } from 'effect/Function'
import {
  DecisionIdCollisionError,
  InvalidThresholdError,
  MeasureCommandRejected,
  MeasureInputRefused,
} from './DiscernError.schema.js'
import { measureCaseOf, measureOf } from './eval-measure.js'
import { EvalReport, metricsOf } from './EvalReport.schema.js'
import type { Pattern } from './pattern.blueprint.js'

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

/** Options for a threshold sweep: one pattern per candidate value over shared examples. */
export interface SweepOptions<S extends Schema.Constraint, V> {
  readonly schema: S
  readonly values: ReadonlyArray<V>
  readonly pattern: (value: V) => Pattern<S['Type']>
  readonly examples: ReadonlyArray<EvalExample<S['Type']>>
}

/** Options for calibrating: a sweep over at least one candidate value. */
export interface CalibrateOptions<S extends Schema.Constraint, V> extends Omit<SweepOptions<S, V>, 'values'> {
  readonly values: readonly [V, ...Array<V>]
  readonly metric?: 'f1' | 'accuracy' | 'selectiveAccuracy' | undefined
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
      Effect.forEach(examples, (example) => measureOf(measureCaseOf({ schema, pattern, example }))),
      (records) => EvalReport.make({ metrics: metricsOf(records), records }),
    ),
)
