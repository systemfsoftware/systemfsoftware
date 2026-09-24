import { Schema } from 'effect'

export class RoutingLabelEntry extends Schema.Class<RoutingLabelEntry>('RoutingLabelEntry')({
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  governing: Schema.Array(Schema.NonEmptyString),
  deferred: Schema.Array(Schema.NonEmptyString),
}) {}

export class RoutingLabels extends Schema.Class<RoutingLabels>('RoutingLabels')({
  version: Schema.Literal(1),
  entries: Schema.Array(RoutingLabelEntry),
}) {}

export class PairLabel extends Schema.Class<PairLabel>('PairLabel')({
  id: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
  split: Schema.Literals(['train', 'dev', 'test']),
  verdict: Schema.Literals(['Pass', 'Fail']),
  origin: Schema.Literals(['observed', 'planted']),
  notes: Schema.String,
  plantedBody: Schema.optional(Schema.NonEmptyString),
}) {}

export class PairLabels extends Schema.Class<PairLabels>('PairLabels')({
  version: Schema.Literal(1),
  entries: Schema.Array(PairLabel),
}) {}
