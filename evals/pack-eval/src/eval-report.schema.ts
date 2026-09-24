import { Schema } from 'effect'
import { TaskSplit } from './task-set.schema.js'

export const RunOutcome = Schema.Literals([0, 1, 2])
export type RunOutcome = typeof RunOutcome.Type

export class EvidenceFloor extends Schema.Class<EvidenceFloor>('EvidenceFloor')({
  positives: Schema.Int,
  negatives: Schema.Int,
}) {}

export class RuleCounts extends Schema.Class<RuleCounts>('RuleCounts')({
  truePositives: Schema.Int,
  falseNegatives: Schema.Int,
  falsePositives: Schema.Int,
  trueNegatives: Schema.Int,
}) {}

export class RuleRates extends Schema.Class<RuleRates>('RuleRates')({
  tpr: Schema.Finite,
  tprLower: Schema.Finite,
  tprUpper: Schema.Finite,
  tnr: Schema.Finite,
  tnrLower: Schema.Finite,
  tnrUpper: Schema.Finite,
}) {}

export class RuleScored extends Schema.TaggedClass<RuleScored>()('RuleScored', {
  rates: RuleRates,
}) {}

export class RuleInsufficientEvidence
  extends Schema.TaggedClass<RuleInsufficientEvidence>()('RuleInsufficientEvidence', {})
{}

export class RuleUnlabelled extends Schema.TaggedClass<RuleUnlabelled>()('RuleUnlabelled', {}) {}

export const RuleVerdict = Schema.Union([RuleScored, RuleInsufficientEvidence, RuleUnlabelled])
export type RuleVerdict = typeof RuleVerdict.Type

export class RuleRoute extends Schema.Class<RuleRoute>('RuleRoute')({
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
  split: TaskSplit,
  counts: RuleCounts,
  verdict: RuleVerdict,
}) {}

export class ContradictionNotEvaluated
  extends Schema.TaggedClass<ContradictionNotEvaluated>()('ContradictionNotEvaluated', {})
{}

export const ContradictionReport = Schema.Union([ContradictionNotEvaluated])
export type ContradictionReport = typeof ContradictionReport.Type

export class EvalReport extends Schema.Class<EvalReport>('EvalReport')({
  schemaVersion: Schema.Literal(1),
  seed: Schema.Int,
  iterations: Schema.Int,
  confidence: Schema.Finite,
  evidenceFloor: EvidenceFloor,
  provider: Schema.NonEmptyString,
  servedSelectorModel: Schema.NonEmptyString,
  rules: Schema.Array(RuleRoute),
  contradiction: ContradictionReport,
  outcome: RunOutcome,
}) {}
