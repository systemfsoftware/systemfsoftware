import { Schema } from 'effect'
import { PatternAst } from './PatternAst.schema.js'
import { PatternStatus } from './Verdict.schema.js'

/**
 * One decision of a compiled plan: the identity an answer is stored under, its content
 * address, which decision kind produces it, and the instructions the model sees. `kind` is
 * the closed set of semantic decision kinds; `criteria` carries the kind's own thresholds or
 * labels when it declares any.
 */
export class DecisionInspection extends Schema.Class<DecisionInspection>('DecisionInspection')({
  id: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literals(['Classify', 'Rate', 'Probability']),
  instructions: Schema.String,
  criteria: Schema.optional(Schema.Json),
}) {}

/** One case of a compiled plan: its dispatch id and the pattern that decides it. */
export class CaseInspection extends Schema.Class<CaseInspection>('CaseInspection')({
  id: Schema.String,
  pattern: PatternAst,
}) {}

/**
 * The serializable semantic execution plan `compile` produces and `inspect` returns
 * (reference `CompiledPlan`, version 1).
 */
export class CompiledPlan extends Schema.Class<CompiledPlan>('CompiledPlan')({
  version: Schema.Literal(1),
  fingerprint: Schema.String,
  decisions: Schema.Array(DecisionInspection),
  cases: Schema.Array(CaseInspection),
  hasUncertainHandler: Schema.Boolean,
}) {}

/** How one case resolved during one dispatch, in case order. */
export class CaseTrace extends Schema.Class<CaseTrace>('CaseTrace')({
  id: Schema.String,
  status: PatternStatus,
  reason: Schema.optional(Schema.String),
}) {}

export class SelectedCase extends Schema.TaggedClass<SelectedCase>()('Case', {
  id: Schema.String,
}) {}

export class SelectedFallback extends Schema.TaggedClass<SelectedFallback>()('Fallback', {}) {}

export class SelectedUncertain extends Schema.TaggedClass<SelectedUncertain>()('Uncertain', {
  id: Schema.String,
}) {}

export const TraceSelection = Schema.Union([SelectedCase, SelectedFallback, SelectedUncertain])
export type TraceSelection = typeof TraceSelection.Type

/**
 * What a matcher did, for diagnostics: which cases were evaluated, how each resolved, and
 * which branch ran (reference `Trace`, version 2). A trace is not what you replay from;
 * replay is driven by content-addressed observations.
 */
export class Trace extends Schema.Class<Trace>('Trace')({
  version: Schema.Literal(2),
  planFingerprint: Schema.String,
  answers: Schema.Record(Schema.String, Schema.Json),
  cases: Schema.Array(CaseTrace),
  selected: TraceSelection,
}) {}
