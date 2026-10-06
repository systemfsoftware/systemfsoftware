import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const NotificationPolicyOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/NotificationPolicyOutcome',
)
type NotificationPolicyOutcomeTypeId = typeof NotificationPolicyOutcomeTypeId

const Mechanism = Schema.StructWithRest(
  Schema.Struct({ id: Schema.optional(Schema.String) }),
  [Schema.Record(Schema.String, Schema.Json)],
)
export type NotificationPolicyMechanism = typeof Mechanism.Type

export const NotificationPolicyMechanisms = Schema.StructWithRest(
  Schema.Struct({
    email: Schema.optional(Schema.Array(Mechanism)),
    pagerduty: Schema.optional(Schema.Array(Mechanism)),
    webhooks: Schema.optional(Schema.Array(Mechanism)),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)
export type NotificationPolicyMechanisms = typeof NotificationPolicyMechanisms.Type

export const NotificationPolicy = Schema.Struct({
  alert_interval: Schema.optional(Schema.String),
  alert_type: Schema.String,
  created: Schema.String,
  description: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  filters: Schema.optional(Schema.Json),
  id: Schema.String,
  mechanisms: NotificationPolicyMechanisms,
  modified: Schema.String,
  name: Schema.String,
})
export type NotificationPolicy = typeof NotificationPolicy.Type

export const NotificationPolicyState = Schema.Array(NotificationPolicy)
export type NotificationPolicyState = typeof NotificationPolicyState.Type

export const emptyNotificationPolicyState: NotificationPolicyState = []

export const NotificationPolicyBody = Schema.Struct({
  alert_interval: Schema.optional(Schema.String),
  alert_type: Schema.String,
  description: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  filters: Schema.optional(Schema.Json),
  mechanisms: NotificationPolicyMechanisms,
  name: Schema.String,
})
export type NotificationPolicyBody = typeof NotificationPolicyBody.Type

export const NotificationPolicyPatch = Schema.Struct({
  alert_interval: Schema.optional(Schema.String),
  alert_type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  filters: Schema.optional(Schema.Json),
  mechanisms: Schema.optional(NotificationPolicyMechanisms),
  name: Schema.optional(Schema.String),
})
export type NotificationPolicyPatch = typeof NotificationPolicyPatch.Type

export class ListNotificationPolicies extends Schema.TaggedClass<ListNotificationPolicies>()(
  'ListNotificationPolicies',
  {},
) {}

export class CreateNotificationPolicy extends Schema.TaggedClass<CreateNotificationPolicy>()('CreateNotificationPolicy', {
  alert_interval: Schema.optional(Schema.String),
  alert_type: Schema.String,
  description: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  filters: Schema.optional(Schema.Json),
  mechanisms: NotificationPolicyMechanisms,
  name: Schema.String,
}) {}

export class GetNotificationPolicy extends Schema.TaggedClass<GetNotificationPolicy>()('GetNotificationPolicy', {
  policy_id: Schema.String,
}) {}

export class UpdateNotificationPolicy extends Schema.TaggedClass<UpdateNotificationPolicy>()('UpdateNotificationPolicy', {
  policy_id: Schema.String,
  alert_interval: Schema.optional(Schema.String),
  alert_type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  filters: Schema.optional(Schema.Json),
  mechanisms: Schema.optional(NotificationPolicyMechanisms),
  name: Schema.optional(Schema.String),
}) {}

export class DeleteNotificationPolicy extends Schema.TaggedClass<DeleteNotificationPolicy>()('DeleteNotificationPolicy', {
  policy_id: Schema.String,
}) {}

export const NotificationPolicyRequest = Schema.Union([
  ListNotificationPolicies,
  CreateNotificationPolicy,
  GetNotificationPolicy,
  UpdateNotificationPolicy,
  DeleteNotificationPolicy,
])
export type NotificationPolicyRequest = typeof NotificationPolicyRequest.Type

export class NotificationPolicyApplied extends Schema.TaggedClass<NotificationPolicyApplied>()(
  'NotificationPolicyApplied',
  {
    state: NotificationPolicyState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [NotificationPolicyOutcomeTypeId] = NotificationPolicyOutcomeTypeId
}

export class NotificationPolicyRefused extends Schema.TaggedClass<NotificationPolicyRefused>()(
  'NotificationPolicyRefused',
  {
    state: NotificationPolicyState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [NotificationPolicyOutcomeTypeId] = NotificationPolicyOutcomeTypeId
}

export const NotificationPolicyOutcome = Schema.Union([NotificationPolicyApplied, NotificationPolicyRefused])
export type NotificationPolicyOutcome = typeof NotificationPolicyOutcome.Type

export class NotificationPolicyCommand extends Schema.TaggedClass<NotificationPolicyCommand>()(
  'NotificationPolicyCommand',
  {
    now: Schema.String,
    newId: Schema.String,
    state: NotificationPolicyState,
    request: NotificationPolicyRequest,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
