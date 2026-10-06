import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import {
  CreateNotificationWebhook,
  DeleteNotificationWebhook,
  GetNotificationWebhook,
  ListNotificationWebhooks,
  NotificationWebhookBody,
  NotificationWebhookCommand,
  UpdateNotificationWebhook,
} from '../state/notification-webhook.schema.js'
import type { NotificationWebhookRequest } from '../state/notification-webhook.schema.js'
import { notificationWebhook } from '../state/notification-webhook.workflow.js'
import { decodePayload } from './decode-payload.js'

const applyWebhook = (operation: string, isWrite: boolean, request: NotificationWebhookRequest) =>
  settleOperation({
    slot: 'notificationWebhooks',
    operation,
    isWrite,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        notificationWebhook(
          NotificationWebhookCommand.make({
            now: input.now,
            newId: input.newId,
            state: input.state.notificationWebhooks,
            request,
          }),
        ),
      )
      return settledOf(outcome)
    },
  })

export const notificationWebhookHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Notification webhooks',
  (handlers) =>
    handlers
      .handle(
        'notificationWebhooksListWebhooks',
        () => applyWebhook('notificationWebhooksListWebhooks', false, ListNotificationWebhooks.make({})),
      )
      .handle('notificationWebhooksCreateAWebhook', ({ payload }) =>
        decodePayload(payload, {
          schema: NotificationWebhookBody,
          settle: (body) =>
            applyWebhook(
              'notificationWebhooksCreateAWebhook',
              true,
              CreateNotificationWebhook.make({ name: body.name, secret: body.secret, url: body.url }),
            ),
        }))
      .handle('notificationWebhooksGetAWebhook', ({ params }) =>
        applyWebhook(
          'notificationWebhooksGetAWebhook',
          false,
          GetNotificationWebhook.make({ webhook_id: params.webhook_id }),
        ))
      .handle('notificationWebhooksUpdateAWebhook', ({ params, payload }) =>
        decodePayload(payload, {
          schema: NotificationWebhookBody,
          settle: (body) =>
            applyWebhook(
              'notificationWebhooksUpdateAWebhook',
              true,
              UpdateNotificationWebhook.make({
                webhook_id: params.webhook_id,
                name: body.name,
                secret: body.secret,
                url: body.url,
              }),
            ),
        }))
      .handle('notificationWebhooksDeleteAWebhook', ({ params }) =>
        applyWebhook(
          'notificationWebhooksDeleteAWebhook',
          true,
          DeleteNotificationWebhook.make({ webhook_id: params.webhook_id }),
        )),
)
