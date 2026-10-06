import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateNotificationWebhook,
  DeleteNotificationWebhook,
  GetNotificationWebhook,
  NotificationWebhookApplied,
  NotificationWebhookCommand,
  NotificationWebhookOutcome,
  NotificationWebhookRefused,
  NotificationWebhookType,
  UpdateNotificationWebhook,
} from './notification-webhook.schema.js'
import type {
  NotificationWebhook,
  NotificationWebhookState,
} from './notification-webhook.schema.js'

const WebhookTypeHint = Schema.Struct({ needle: Schema.String, type: NotificationWebhookType })

const WEBHOOK_TYPE_HINTS: ReadonlyArray<typeof WebhookTypeHint.Type> = [
  { needle: 'discord', type: 'discord' },
  { needle: 'slack', type: 'slack' },
  { needle: 'datadoghq', type: 'datadog' },
  { needle: 'opsgenie', type: 'opsgenie' },
  { needle: 'splunk', type: 'splunk' },
  { needle: 'feishu', type: 'feishu' },
  { needle: 'larksuite', type: 'feishu' },
  { needle: 'chat.googleapis.com', type: 'gchat' },
]

const inferWebhookType = (url: string): NotificationWebhookType =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(WEBHOOK_TYPE_HINTS, (hint) => url.includes(hint.needle)),
      (hint) => hint.type,
    ),
    () => 'generic',
  )

const notFound = (state: NotificationWebhookState): NotificationWebhookRefused =>
  NotificationWebhookRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'Webhook not found.' }) })

const internalError = (state: NotificationWebhookState): NotificationWebhookRefused =>
  NotificationWebhookRefused.make({
    state,
    status: 500,
    body: failureEnvelope({ code: 15000, message: 'Internal server error.' }),
  })

const webhookView = (webhook: NotificationWebhook): Schema.Json => ({
  created_at: webhook.created_at,
  id: webhook.id,
  name: webhook.name,
  type: webhook.type,
  url: webhook.url,
})

const findWebhook = (state: NotificationWebhookState, id: string): Option.Option<NotificationWebhook> =>
  Array.findFirst(state, (webhook) => webhook.id === id)

const buildWebhook = (
  command: NotificationWebhookCommand,
  request: CreateNotificationWebhook,
  id: string,
): NotificationWebhook => ({
  created_at: command.now,
  id,
  name: request.name,
  secret: request.secret,
  type: inferWebhookType(request.url),
  url: request.url,
})

const patchWebhook = (
  request: UpdateNotificationWebhook,
  webhook: NotificationWebhook,
): NotificationWebhook => ({
  created_at: webhook.created_at,
  id: webhook.id,
  name: request.name,
  secret: Option.getOrElse(Option.fromUndefinedOr(request.secret), () => webhook.secret),
  type: inferWebhookType(request.url),
  url: request.url,
})

const listWebhooks = (command: NotificationWebhookCommand): NotificationWebhookOutcome =>
  NotificationWebhookApplied.make({
    state: command.state,
    status: 200,
    body: successEnvelope(Array.map(command.state, webhookView)),
  })

const createWebhook = (command: NotificationWebhookCommand, request: CreateNotificationWebhook): NotificationWebhookOutcome => {
  const webhook = buildWebhook(command, request, command.newId)
  return NotificationWebhookApplied.make({
    state: Array.append(command.state, webhook),
    status: 201,
    body: successEnvelope({ id: webhook.id }),
  })
}

const getWebhook = (command: NotificationWebhookCommand, request: GetNotificationWebhook): NotificationWebhookOutcome =>
  Option.match(findWebhook(command.state, request.webhook_id), {
    onNone: () => notFound(command.state),
    onSome: (webhook) =>
      NotificationWebhookApplied.make({ state: command.state, status: 200, body: successEnvelope(webhookView(webhook)) }),
  })

const updateWebhook = (command: NotificationWebhookCommand, request: UpdateNotificationWebhook): NotificationWebhookOutcome =>
  Option.match(findWebhook(command.state, request.webhook_id), {
    onNone: () => notFound(command.state),
    onSome: (webhook) => {
      const patched = patchWebhook(request, webhook)
      const state = Array.map(command.state, (candidate) =>
        Match.value(candidate.id === webhook.id).pipe(
          Match.when(true, () => patched),
          Match.when(false, () => candidate),
          Match.exhaustive,
        ))
      return NotificationWebhookApplied.make({ state, status: 200, body: successEnvelope({ id: patched.id }) })
    },
  })

const deleteWebhook = (command: NotificationWebhookCommand, request: DeleteNotificationWebhook): NotificationWebhookOutcome =>
  Option.match(findWebhook(command.state, request.webhook_id), {
    onNone: () => internalError(command.state),
    onSome: (webhook) =>
      NotificationWebhookApplied.make({
        state: Array.filter(command.state, (candidate) => candidate.id !== webhook.id),
        status: 200,
        body: successEnvelope({}),
      }),
  })

const decide = (command: NotificationWebhookCommand): Result.Result<NotificationWebhookOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListNotificationWebhooks', () => listWebhooks(command)),
      Match.tag('CreateNotificationWebhook', (request) => createWebhook(command, request)),
      Match.tag('GetNotificationWebhook', (request) => getWebhook(command, request)),
      Match.tag('UpdateNotificationWebhook', (request) => updateWebhook(command, request)),
      Match.tag('DeleteNotificationWebhook', (request) => deleteWebhook(command, request)),
      Match.exhaustive,
    ),
  )

export const notificationWebhook = Workflow.make({
  command: NotificationWebhookCommand,
  decision: NotificationWebhookOutcome,
  error: Schema.Never,
  decide,
})
