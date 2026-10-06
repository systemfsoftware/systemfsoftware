import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const NotificationWebhookOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/NotificationWebhookOutcome',
)
type NotificationWebhookOutcomeTypeId = typeof NotificationWebhookOutcomeTypeId

export const NotificationWebhookType = Schema.Literals([
  'datadog',
  'discord',
  'feishu',
  'gchat',
  'generic',
  'opsgenie',
  'slack',
  'splunk',
])
export type NotificationWebhookType = typeof NotificationWebhookType.Type

export const NotificationWebhook = Schema.Struct({
  created_at: Schema.String,
  id: Schema.String,
  name: Schema.String,
  secret: Schema.optional(Schema.String),
  type: NotificationWebhookType,
  url: Schema.String,
})
export type NotificationWebhook = typeof NotificationWebhook.Type

export const NotificationWebhookState = Schema.Array(NotificationWebhook)
export type NotificationWebhookState = typeof NotificationWebhookState.Type

export const emptyNotificationWebhookState: NotificationWebhookState = []

export const NotificationWebhookBody = Schema.Struct({
  name: Schema.String,
  secret: Schema.optional(Schema.String),
  url: Schema.String,
})
export type NotificationWebhookBody = typeof NotificationWebhookBody.Type

export class ListNotificationWebhooks extends Schema.TaggedClass<ListNotificationWebhooks>()(
  'ListNotificationWebhooks',
  {},
) {}

export class CreateNotificationWebhook extends Schema.TaggedClass<CreateNotificationWebhook>()(
  'CreateNotificationWebhook',
  {
    name: Schema.String,
    secret: Schema.optional(Schema.String),
    url: Schema.String,
  },
) {}

export class GetNotificationWebhook extends Schema.TaggedClass<GetNotificationWebhook>()('GetNotificationWebhook', {
  webhook_id: Schema.String,
}) {}

export class UpdateNotificationWebhook extends Schema.TaggedClass<UpdateNotificationWebhook>()(
  'UpdateNotificationWebhook',
  {
    webhook_id: Schema.String,
    name: Schema.String,
    secret: Schema.optional(Schema.String),
    url: Schema.String,
  },
) {}

export class DeleteNotificationWebhook extends Schema.TaggedClass<DeleteNotificationWebhook>()(
  'DeleteNotificationWebhook',
  {
    webhook_id: Schema.String,
  },
) {}

export const NotificationWebhookRequest = Schema.Union([
  ListNotificationWebhooks,
  CreateNotificationWebhook,
  GetNotificationWebhook,
  UpdateNotificationWebhook,
  DeleteNotificationWebhook,
])
export type NotificationWebhookRequest = typeof NotificationWebhookRequest.Type

export class NotificationWebhookApplied extends Schema.TaggedClass<NotificationWebhookApplied>()(
  'NotificationWebhookApplied',
  {
    state: NotificationWebhookState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [NotificationWebhookOutcomeTypeId] = NotificationWebhookOutcomeTypeId
}

export class NotificationWebhookRefused extends Schema.TaggedClass<NotificationWebhookRefused>()(
  'NotificationWebhookRefused',
  {
    state: NotificationWebhookState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [NotificationWebhookOutcomeTypeId] = NotificationWebhookOutcomeTypeId
}

export const NotificationWebhookOutcome = Schema.Union([NotificationWebhookApplied, NotificationWebhookRefused])
export type NotificationWebhookOutcome = typeof NotificationWebhookOutcome.Type

export class NotificationWebhookCommand extends Schema.TaggedClass<NotificationWebhookCommand>()(
  'NotificationWebhookCommand',
  {
    now: Schema.String,
    newId: Schema.String,
    state: NotificationWebhookState,
    request: NotificationWebhookRequest,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
