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

export class JudgeValidityValidated extends Schema.TaggedClass<JudgeValidityValidated>()(
  'JudgeValidityValidated',
  {
    tpr: Schema.Finite,
    tnr: Schema.Finite,
  },
) {}

export class JudgeValidityUnvalidated extends Schema.TaggedClass<JudgeValidityUnvalidated>()(
  'JudgeValidityUnvalidated',
  {
    tpr: Schema.Finite,
    tnr: Schema.Finite,
    short: Schema.Literals(['TPR', 'TNR', 'both']),
  },
) {}

export class JudgeValidityUnavailable extends Schema.TaggedClass<JudgeValidityUnavailable>()(
  'JudgeValidityUnavailable',
  {
    reason: Schema.NonEmptyString,
  },
) {}

export const JudgeValidityReport = Schema.Union([
  JudgeValidityValidated,
  JudgeValidityUnvalidated,
  JudgeValidityUnavailable,
])
export type JudgeValidityReport = typeof JudgeValidityReport.Type

export class FailLabelCounts extends Schema.Class<FailLabelCounts>('FailLabelCounts')({
  observed: Schema.Int,
  planted: Schema.Int,
}) {}

export class WitnessedFailure extends Schema.Class<WitnessedFailure>('WitnessedFailure')({
  packId: Schema.NonEmptyString,
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  critique: Schema.NonEmptyString,
}) {}

export class UnwitnessedPairView extends Schema.Class<UnwitnessedPairView>('UnwitnessedPairView')({
  packId: Schema.NonEmptyString,
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
}) {}

export class ContradictionRate extends Schema.Class<ContradictionRate>('ContradictionRate')({
  packId: Schema.NonEmptyString,
  estimate: Schema.Finite,
  lower: Schema.Finite,
  upper: Schema.Finite,
}) {}

export class ContradictionJudged extends Schema.TaggedClass<ContradictionJudged>()('ContradictionJudged', {
  judge: JudgeValidityReport,
  judgeMinimum: Schema.Finite,
  servedJudgeModel: Schema.NonEmptyString,
  failures: Schema.Array(WitnessedFailure),
  failLabels: FailLabelCounts,
  unwitnessedPairs: Schema.Array(UnwitnessedPairView),
  rates: Schema.Array(ContradictionRate),
}) {}

export const ContradictionReport = Schema.Union([ContradictionNotEvaluated, ContradictionJudged])
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
  refusal: Schema.optional(Schema.NonEmptyString),
}) {}
