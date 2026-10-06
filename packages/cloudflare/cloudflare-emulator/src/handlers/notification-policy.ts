import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
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
import type { NotificationPolicyRequest } from '../state/notification-policy.schema.js'
import { notificationPolicy } from '../state/notification-policy.workflow.js'
import { decodePayload } from './decode-payload.js'

const applyPolicy = (operation: string, isWrite: boolean, request: NotificationPolicyRequest) =>
  settleOperation({
    slot: 'notificationPolicies',
    operation,
    isWrite,
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
      return settledOf(outcome)
    },
  })

export const notificationPolicyHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Notification policies',
  (handlers) =>
    handlers
      .handle(
        'notificationPoliciesListNotificationPolicies',
        () => applyPolicy('notificationPoliciesListNotificationPolicies', false, ListNotificationPolicies.make({})),
      )
      .handle('notificationPoliciesCreateANotificationPolicy', ({ payload }) =>
        decodePayload(payload, {
          schema: NotificationPolicyBody,
          settle: (body) =>
            applyPolicy(
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
            ),
        }))
      .handle('notificationPoliciesGetANotificationPolicy', ({ params }) =>
        applyPolicy(
          'notificationPoliciesGetANotificationPolicy',
          false,
          GetNotificationPolicy.make({ policy_id: params.policy_id }),
        ))
      .handle('notificationPoliciesUpdateANotificationPolicy', ({ params, payload }) =>
        decodePayload(payload, {
          schema: NotificationPolicyPatch,
          settle: (body) =>
            applyPolicy(
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
            ),
        }))
      .handle('notificationPoliciesDeleteANotificationPolicy', ({ params }) =>
        applyPolicy(
          'notificationPoliciesDeleteANotificationPolicy',
          true,
          DeleteNotificationPolicy.make({ policy_id: params.policy_id }),
        )),
)
