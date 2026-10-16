import { Schema } from 'effect'
import { PatternAst } from './PatternAst.schema.js'

const ClassifyInspection = Schema.Struct({
  id: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literal('Classify'),
  instructions: Schema.String,
  criteria: Schema.Record(Schema.String, Schema.String),
})

const RateInspection = Schema.Struct({
  id: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literal('Rate'),
  instructions: Schema.String,
  criteria: Schema.Array(Schema.String),
})

const ProbabilityInspection = Schema.Struct({
  id: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literal('Probability'),
  instructions: Schema.String,
  criteria: Schema.Struct({ false: Schema.String, true: Schema.String }),
})

/**
 * One decision of a compiled plan: the identity an answer is stored under, its content
 * address, which decision kind produces it, and the instructions the model sees. `kind` is
 * the closed set of semantic decision kinds; `criteria` carries the kind's own thresholds or
 * labels when it declares any.
 */
export const DecisionInspection = Schema.Union([ClassifyInspection, RateInspection, ProbabilityInspection]).pipe(
  Schema.toTaggedUnion('kind'),
)
export type DecisionInspection = typeof DecisionInspection.Type

export const CaseInspection = Schema.Struct({
  id: Schema.String,
  pattern: PatternAst,
})
export type CaseInspection = typeof CaseInspection.Type

/**
 * The serializable semantic execution plan `compile` produces and `inspect` returns
 * (reference `CompiledPlan`, version 1).
 */
export const CompiledPlan = Schema.Struct({
  version: Schema.Literal(1),
  fingerprint: Schema.String,
  decisions: Schema.Array(DecisionInspection),
  cases: Schema.Array(CaseInspection),
  hasUncertainHandler: Schema.Boolean,
})
export type CompiledPlan = typeof CompiledPlan.Type

/** How one case resolved during one dispatch, in case order. */
export const CaseTrace = Schema.Union([
  Schema.Struct({ id: Schema.String, status: Schema.Literal('Match') }),
  Schema.Struct({ id: Schema.String, status: Schema.Literal('Miss') }),
  Schema.Struct({ id: Schema.String, status: Schema.Literal('Uncertain'), reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('status'))
export type CaseTrace = typeof CaseTrace.Type

export const SelectedCase = Schema.TaggedStruct('Case', {
  id: Schema.String,
})
export type SelectedCase = typeof SelectedCase.Type

export const SelectedFallback = Schema.TaggedStruct('Fallback', {})
export type SelectedFallback = typeof SelectedFallback.Type

export const SelectedUncertain = Schema.TaggedStruct('Uncertain', {
  id: Schema.String,
})
export type SelectedUncertain = typeof SelectedUncertain.Type

export const TraceSelection = Schema.Union([SelectedCase, SelectedFallback, SelectedUncertain])
export type TraceSelection = typeof TraceSelection.Type

/**
 * What a matcher did, for diagnostics: which cases were evaluated, how each resolved, and
 * which branch ran (reference `Trace`, version 2). A trace is not what you replay from;
 * replay is driven by content-addressed observations.
 */
export const Trace = Schema.Struct({
  version: Schema.Literal(2),
  planFingerprint: Schema.String,
  answers: Schema.Record(Schema.String, Schema.Json),
  cases: Schema.Array(CaseTrace),
  selected: TraceSelection,
})
export type Trace = typeof Trace.Type
