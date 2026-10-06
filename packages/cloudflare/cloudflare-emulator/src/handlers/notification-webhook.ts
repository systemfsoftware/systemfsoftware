import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect, Match, Schema } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  CreateNotificationWebhook,
  DeleteNotificationWebhook,
  GetNotificationWebhook,
  ListNotificationWebhooks,
  NotificationWebhookBody,
  NotificationWebhookCommand,
  UpdateNotificationWebhook,
} from '../state/notification-webhook.schema.js'
import type { NotificationWebhookRequest, NotificationWebhookState } from '../state/notification-webhook.schema.js'
import { notificationWebhook } from '../state/notification-webhook.workflow.js'

const badRequest = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(failureEnvelope({ code: 1000, message: 'Invalid request body.' }), { status: 400 })

const applyWebhook = (operation: string, isWrite: boolean, request: NotificationWebhookRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<NotificationWebhookState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, notificationWebhooks: product }),
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
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
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
      .handle('notificationWebhooksCreateAWebhook', ({ payload }) => {
        const decoded = Schema.decodeUnknownResult(NotificationWebhookBody)(payload)
        return Match.value(Result.isSuccess(decoded)).pipe(
          Match.when(false, () => Effect.succeed(badRequest())),
          Match.when(true, () => {
            const body = Result.getOrThrow(decoded)
            return applyWebhook(
              'notificationWebhooksCreateAWebhook',
              true,
              CreateNotificationWebhook.make({ name: body.name, secret: body.secret, url: body.url }),
            )
          }),
          Match.exhaustive,
        )
      })
      .handle('notificationWebhooksGetAWebhook', ({ params }) =>
        applyWebhook(
          'notificationWebhooksGetAWebhook',
          false,
          GetNotificationWebhook.make({ webhook_id: params.webhook_id }),
        ))
      .handle('notificationWebhooksUpdateAWebhook', ({ params, payload }) => {
        const decoded = Schema.decodeUnknownResult(NotificationWebhookBody)(payload)
        return Match.value(Result.isSuccess(decoded)).pipe(
          Match.when(false, () => Effect.succeed(badRequest())),
          Match.when(true, () => {
            const body = Result.getOrThrow(decoded)
            return applyWebhook(
              'notificationWebhooksUpdateAWebhook',
              true,
              UpdateNotificationWebhook.make({
                webhook_id: params.webhook_id,
                name: body.name,
                secret: body.secret,
                url: body.url,
              }),
            )
          }),
          Match.exhaustive,
        )
      })
      .handle('notificationWebhooksDeleteAWebhook', ({ params }) =>
        applyWebhook(
          'notificationWebhooksDeleteAWebhook',
          true,
          DeleteNotificationWebhook.make({ webhook_id: params.webhook_id }),
        )),
)
