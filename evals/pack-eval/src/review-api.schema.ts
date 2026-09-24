import { Schema } from 'effect'
import { TaskSplit } from './task-set.schema.js'

export class ReviewRuleView extends Schema.Class<ReviewRuleView>('ReviewRuleView')({
  stem: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  appliesWhen: Schema.Array(Schema.String),
  body: Schema.String,
}) {}

export class ReviewPackView extends Schema.Class<ReviewPackView>('ReviewPackView')({
  packId: Schema.NonEmptyString,
  rules: Schema.Array(ReviewRuleView),
  governing: Schema.Array(Schema.NonEmptyString),
  deferred: Schema.Array(Schema.NonEmptyString),
  traceLoadedStems: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class ReviewTaskView extends Schema.Class<ReviewTaskView>('ReviewTaskView')({
  taskId: Schema.NonEmptyString,
  text: Schema.String,
  packs: Schema.Array(ReviewPackView),
}) {}

export class ReviewCandidateList extends Schema.Class<ReviewCandidateList>('ReviewCandidateList')({
  candidates: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      text: Schema.NonEmptyString,
      dimensions: Schema.Record(Schema.String, Schema.String),
    }),
  ),
}) {}

export class ReviewAccepted extends Schema.Class<ReviewAccepted>('ReviewAccepted')({
  taskId: Schema.NonEmptyString,
  split: Schema.Literals(['dev', 'test']),
}) {}

export class ReviewRejected extends Schema.Class<ReviewRejected>('ReviewRejected')({
  taskId: Schema.NonEmptyString,
}) {}

export class ReviewLabelsSaved extends Schema.Class<ReviewLabelsSaved>('ReviewLabelsSaved')({
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
}) {}

export class ReviewSaveLabelsBody extends Schema.Class<ReviewSaveLabelsBody>('ReviewSaveLabelsBody')({
  governing: Schema.Array(Schema.NonEmptyString),
  deferred: Schema.Array(Schema.NonEmptyString),
}) {}

export class ReviewError extends Schema.Class<ReviewError>('ReviewError')({
  error: Schema.String,
}) {}

export class UnknownLabelStem extends Schema.TaggedError<UnknownLabelStem>()('UnknownLabelStem', {
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
}) {}

/** A candidate, task, or pack the dataset does not hold. */
export class ReviewNotFound extends Schema.TaggedError<ReviewNotFound>()('ReviewNotFound', {
  what: Schema.Literals(['candidate', 'task', 'pack']),
  id: Schema.NonEmptyString,
}) {}

export class ReviewTaskSummary extends Schema.Class<ReviewTaskSummary>('ReviewTaskSummary')({
  taskId: Schema.NonEmptyString,
  text: Schema.String,
  split: TaskSplit,
}) {}

export class ReviewTaskList extends Schema.Class<ReviewTaskList>('ReviewTaskList')({
  tasks: Schema.Array(ReviewTaskSummary),
}) {}

export const RouteIdParams = Schema.Struct({ id: Schema.NonEmptyString })
export type RouteIdParams = typeof RouteIdParams.Type

export const RoutePackQuery = Schema.Struct({ pack: Schema.NonEmptyString })
export type RoutePackQuery = typeof RoutePackQuery.Type
export class ReviewPairRule extends Schema.Class<ReviewPairRule>('ReviewPairRule')({
  stem: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  body: Schema.String,
}) {}

export class ReviewWitnessedPair extends Schema.Class<ReviewWitnessedPair>('ReviewWitnessedPair')({
  pairId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  taskText: Schema.String,
  packId: Schema.NonEmptyString,
  ruleA: ReviewPairRule,
  ruleB: ReviewPairRule,
  origin: Schema.optional(Schema.Literals(['observed', 'planted'])),
  split: Schema.optional(Schema.Literals(['train', 'dev', 'test'])),
  verdict: Schema.optional(Schema.Literals(['Pass', 'Fail'])),
  notes: Schema.optional(Schema.String),
  plantedBody: Schema.optional(Schema.NonEmptyString),
}) {}

export class ReviewPairList extends Schema.Class<ReviewPairList>('ReviewPairList')({
  pairs: Schema.Array(ReviewWitnessedPair),
}) {}

export class ReviewSavePairBody extends Schema.Class<ReviewSavePairBody>('ReviewSavePairBody')({
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
  verdict: Schema.Literals(['Pass', 'Fail']),
  origin: Schema.Literals(['observed', 'planted']),
  notes: Schema.String,
  plantedBody: Schema.optional(Schema.NonEmptyString),
}) {}

export class ReviewPairSaved extends Schema.Class<ReviewPairSaved>('ReviewPairSaved')({
  pairId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  split: Schema.Literals(['train', 'dev', 'test']),
  verdict: Schema.Literals(['Pass', 'Fail']),
  origin: Schema.Literals(['observed', 'planted']),
}) {}

export class PairNotGoverning extends Schema.TaggedError<PairNotGoverning>()('PairNotGoverning', {
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
}) {}

export class PlantedPairNeedsBody extends Schema.TaggedError<PlantedPairNeedsBody>()('PlantedPairNeedsBody', {
  pairId: Schema.NonEmptyString,
}) {}
