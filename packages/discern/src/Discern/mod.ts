/**
 * The Discern namespace: semantic pattern matching and control flow over
 * Effect's DecisionModel. Leaf-module re-exports only — the reference member
 * names, the Model namespace, and the public schemas, errors, and types.
 */
export * as Model from '../Model/mod.js'
export * as Procedure from '../Procedure/mod.js'

export { ask, classify, decision, on, probability, rate } from '../decision.resource.js'
export type {
  Answer,
  AnyDecision,
  ClassifyDecision,
  ClassifyOptions,
  ClassifyThresholds,
  DecisionScope,
  ProbabilityBand,
  ProbabilityDecision,
  ProbabilityOptions,
  RateDecision,
  RateOptions,
} from '../decision.resource.js'

export {
  and,
  deterministic,
  matched,
  missed,
  not,
  or,
  predicate,
  reasonOf,
  refine,
  refineResult,
  statusIs,
  statusOf,
  structural,
  uncertain,
} from '../pattern.resource.js'
export type {
  Answers,
  DecisionNode,
  HandlerResult,
  LeafOptions,
  NodeCore,
  Pattern,
  Preview,
  Top,
  UncertainContext,
} from '../pattern.resource.js'

export {
  caseOf as case,
  compile,
  exhaustive,
  inspect,
  match,
  onUncertain,
  orElse,
  otherwise,
  runWithTrace,
  type,
  value,
  when,
} from '../matcher.resource.js'
export type { ClassificationMatcher, FinishedMatcher, Matcher, MatcherFlavor } from '../matcher.resource.js'

export type { Policy, PolicyRun } from '../run-policy.cell.js'

export { Eval } from '../measure-pattern.cell.js'
export type { CalibrateOptions, EvalExample, SweepOptions, SweepResult } from '../measure-pattern.cell.js'

export {
  DecisionIdCollisionError,
  ExhaustiveMatchError,
  InvalidThresholdError,
  UncertainMatchError,
} from '../DiscernError.schema.js'
export { EvalMetrics, EvalRecord, EvalReport } from '../EvalReport.schema.js'
export { CaseInspection, CaseTrace, CompiledPlan, DecisionInspection, Trace } from '../Inspection.schema.js'
export type { PatternAst } from '../PatternAst.schema.js'
export { PatternMatched, PatternMissed, PatternUncertain } from '../Verdict.schema.js'
export type { PatternResult, PatternStatus } from '../Verdict.schema.js'
