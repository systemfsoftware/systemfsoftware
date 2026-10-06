import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect, Match, Schema } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  CreateNotificationPolicy,
  DeleteNotificationPolicy,
  GetNotificationPolicy,
  ListNotificationPolicies,
  NotificationPolicyBody,
  NotificationPolicyCommand,
  NotificationPolicyPatch,
  UpdateNotificationPolicy,
} from '../state/notification-policy.schema.js'
import type { NotificationPolicyRequest, NotificationPolicyState } from '../state/notification-policy.schema.js'
import { notificationPolicy } from '../state/notification-policy.workflow.js'

const badRequest = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(failureEnvelope({ code: 1000, message: 'Invalid request body.' }), { status: 400 })

const applyPolicy = (operation: string, isWrite: boolean, request: NotificationPolicyRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<NotificationPolicyState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, notificationPolicies: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          notificationPolicy(
            NotificationPolicyCommand.make({
              now: input.now,
              newId: input.newId,
              state: input.state.notificationPolicies,
              request,
            }),
          ),
        )
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
  })

export const notificationPolicyHandlers = HttpApiBuilder.group(CloudflareApi, 'Notification policies', (handlers) =>
  handlers
    .handle('notificationPoliciesListNotificationPolicies', () =>
      applyPolicy('notificationPoliciesListNotificationPolicies', false, ListNotificationPolicies.make({})))
    .handle('notificationPoliciesCreateANotificationPolicy', ({ payload }) => {
      const decoded = Schema.decodeUnknownResult(NotificationPolicyBody)(payload)
      return Match.value(Result.isSuccess(decoded)).pipe(
        Match.when(false, () => Effect.succeed(badRequest())),
        Match.when(true, () => {
          const body = Result.getOrThrow(decoded)
          return applyPolicy(
            'notificationPoliciesCreateANotificationPolicy',
            true,
            CreateNotificationPolicy.make({
              alert_interval: body.alert_interval,
              alert_type: body.alert_type,
              description: body.description,
              enabled: body.enabled,
              filters: body.filters,
              mechanisms: body.mechanisms,
              name: body.name,
            }),
          )
        }),
        Match.exhaustive,
      )
    })
    .handle('notificationPoliciesGetANotificationPolicy', ({ params }) =>
      applyPolicy(
        'notificationPoliciesGetANotificationPolicy',
        false,
        GetNotificationPolicy.make({ policy_id: params.policy_id }),
      ))
    .handle('notificationPoliciesUpdateANotificationPolicy', ({ params, payload }) => {
      const decoded = Schema.decodeUnknownResult(NotificationPolicyPatch)(payload)
      return Match.value(Result.isSuccess(decoded)).pipe(
        Match.when(false, () => Effect.succeed(badRequest())),
        Match.when(true, () => {
          const body = Result.getOrThrow(decoded)
          return applyPolicy(
            'notificationPoliciesUpdateANotificationPolicy',
            true,
            UpdateNotificationPolicy.make({
              policy_id: params.policy_id,
              alert_interval: body.alert_interval,
              alert_type: body.alert_type,
              description: body.description,
              enabled: body.enabled,
              filters: body.filters,
              mechanisms: body.mechanisms,
              name: body.name,
            }),
          )
        }),
        Match.exhaustive,
      )
    })
    .handle('notificationPoliciesDeleteANotificationPolicy', ({ params }) =>
      applyPolicy(
        'notificationPoliciesDeleteANotificationPolicy',
        true,
        DeleteNotificationPolicy.make({ policy_id: params.policy_id }),
      )))
