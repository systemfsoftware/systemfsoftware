/**
 * The Discern namespace: semantic pattern matching and control flow over
 * Effect's DecisionModel. Leaf-module re-exports only — the reference member
 * names, the Model namespace, and the public schemas, errors, and types.
 */
export * as Model from '../Model/mod.js'
export * as Procedure from '../Procedure/mod.js'

export {
  above,
  ask,
  atLeast,
  atMost,
  band,
  below,
  between,
  classify,
  decision,
  is,
  margin,
  not,
  on,
  oneOf,
  probability,
  rate,
  where,
  whereResult,
} from '../decision.js'
export type {
  Answer,
  AnyDecision,
  BandOptions,
  ClassifyDecision,
  ClassifyOptions,
  ClassifyThresholds,
  DecisionScope,
  ProbabilityBand,
  ProbabilityDecision,
  ProbabilityOptions,
  RateDecision,
  RateOptions,
} from '../decision.js'

export {
  and,
  deterministic,
  evaluate,
  matched,
  missed,
  or,
  preview,
  reasonOf,
  statusIs,
  statusOf,
  uncertain,
} from '../pattern.js'
export type {
  Answers,
  DecisionNode,
  HandlerResult,
  LeafOptions,
  NodeCore,
  Pattern,
  PatternEvaluator,
  PatternRefusal,
  Preview,
  UncertainContext,
} from '../pattern.js'

export {
  caseOf as case,
  compile,
  exhaustive,
  inspect,
  match,
  onUncertain,
  orElse,
  type,
  value,
  when,
} from '../matcher.js'
export type { ClassificationMatcher, FinishedMatcher, Matcher, MatcherFlavor } from '../matcher.js'

export { runWithTrace } from '../run-policy.cell.js'
export type { Policy, PolicyRun, PolicyTraced } from '../run-policy.cell.js'

export { Eval } from '../measure-pattern.cell.js'
export type { CalibrateOptions, EvalExample, MeasureError, SweepOptions, SweepResult } from '../measure-pattern.cell.js'

export {
  DecisionIdCollisionError,
  ExhaustiveMatchError,
  InvalidThresholdError,
  MeasureCommandRejected,
  MeasureInputRefused,
  PolicyCommandRejected,
  UncertainMatchError,
} from '../DiscernError.schema.js'
export { EvalMetrics, EvalRecord, EvalReport } from '../EvalReport.schema.js'
export { CaseInspection, CaseTrace, CompiledPlan, DecisionInspection, Trace } from '../Inspection.schema.js'
export type { PatternAst } from '../PatternAst.schema.js'
export { PatternMatched, PatternMissed, PatternUncertain } from '../Verdict.schema.js'
export type { PatternResult, PatternStatus } from '../Verdict.schema.js'
