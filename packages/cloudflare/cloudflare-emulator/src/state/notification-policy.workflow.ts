import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateNotificationPolicy,
  DeleteNotificationPolicy,
  GetNotificationPolicy,
  NotificationPolicyApplied,
  NotificationPolicyCommand,
  NotificationPolicyOutcome,
  NotificationPolicyRefused,
  UpdateNotificationPolicy,
} from './notification-policy.schema.js'
import type {
  NotificationPolicy,
  NotificationPolicyMechanism,
  NotificationPolicyMechanisms,
  NotificationPolicyState,
} from './notification-policy.schema.js'

const emptyFilters: Schema.Json = {}

const notFound = (state: NotificationPolicyState): NotificationPolicyRefused =>
  NotificationPolicyRefused.make({
    state,
    status: 404,
    // distilled 1.0.0-rc.13 lib/services/alerting.js:92 PolicyNotFound matches code 0 with "Policy not found".
    body: failureEnvelope({ code: 0, message: 'Policy not found.' }),
  })

const mechanismRequired = (state: NotificationPolicyState): NotificationPolicyRefused =>
  NotificationPolicyRefused.make({
    state,
    status: 400,
    body: failureEnvelope({ code: 17102, message: 'At least one mechanism is required.' }),
  })

const filled = (entries: ReadonlyArray<NotificationPolicyMechanism> | undefined): boolean =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(entries), (list) => list.length > 0),
    () => false,
  )

const hasMechanism = (mechanisms: NotificationPolicyMechanisms): boolean =>
  Array.some([mechanisms.email, mechanisms.webhooks, mechanisms.pagerduty], filled)

const text = (value: string | undefined): string => Option.getOrElse(Option.fromUndefinedOr(value), () => '')

const policyView = (policy: NotificationPolicy): Schema.Json => ({
  alert_interval: text(policy.alert_interval),
  alert_type: policy.alert_type,
  created: policy.created,
  description: text(policy.description),
  enabled: policy.enabled,
  filters: Option.getOrElse(Option.fromUndefinedOr(policy.filters), () => emptyFilters),
  id: policy.id,
  mechanisms: policy.mechanisms,
  modified: policy.modified,
  name: policy.name,
})

const findPolicy = (state: NotificationPolicyState, id: string): Option.Option<NotificationPolicy> =>
  Array.findFirst(state, (policy) => policy.id === id)

const buildPolicy = (
  command: NotificationPolicyCommand,
  request: CreateNotificationPolicy,
  id: string,
  created: string,
): NotificationPolicy => ({
  alert_interval: request.alert_interval,
  alert_type: request.alert_type,
  created,
  description: request.description,
  enabled: request.enabled,
  filters: request.filters,
  id,
  mechanisms: request.mechanisms,
  modified: command.now,
  name: request.name,
})

const listPolicies = (command: NotificationPolicyCommand): NotificationPolicyOutcome =>
  NotificationPolicyApplied.make({
    state: command.state,
    status: 200,
    body: successEnvelope(Array.map(command.state, policyView)),
  })

const createPolicy = (
  command: NotificationPolicyCommand,
  request: CreateNotificationPolicy,
): NotificationPolicyOutcome =>
  Match.value(hasMechanism(request.mechanisms)).pipe(
    Match.when(false, () => mechanismRequired(command.state)),
    Match.when(true, () => {
      const policy = buildPolicy(command, request, command.newId, command.now)
      return NotificationPolicyApplied.make({
        state: Array.append(command.state, policy),
        status: 200,
        body: successEnvelope({ id: policy.id }),
      })
    }),
    Match.exhaustive,
  )

const getPolicy = (command: NotificationPolicyCommand, request: GetNotificationPolicy): NotificationPolicyOutcome =>
  Option.match(findPolicy(command.state, request.policy_id), {
    onNone: () => notFound(command.state),
    onSome: (policy) =>
      NotificationPolicyApplied.make({ state: command.state, status: 200, body: successEnvelope(policyView(policy)) }),
  })

const patchPolicy = (
  command: NotificationPolicyCommand,
  request: UpdateNotificationPolicy,
  policy: NotificationPolicy,
): NotificationPolicy => ({
  alert_interval: Option.getOrElse(Option.fromUndefinedOr(request.alert_interval), () => policy.alert_interval),
  alert_type: Option.getOrElse(Option.fromUndefinedOr(request.alert_type), () => policy.alert_type),
  created: policy.created,
  description: Option.getOrElse(Option.fromUndefinedOr(request.description), () => policy.description),
  enabled: Option.getOrElse(Option.fromUndefinedOr(request.enabled), () => policy.enabled),
  filters: Option.getOrElse(Option.fromUndefinedOr(request.filters), () => policy.filters),
  id: policy.id,
  mechanisms: Option.getOrElse(Option.fromUndefinedOr(request.mechanisms), () => policy.mechanisms),
  modified: command.now,
  name: Option.getOrElse(Option.fromUndefinedOr(request.name), () => policy.name),
})

const updatePolicy = (
  command: NotificationPolicyCommand,
  request: UpdateNotificationPolicy,
): NotificationPolicyOutcome =>
  Option.match(findPolicy(command.state, request.policy_id), {
    onNone: () => notFound(command.state),
    onSome: (policy) => {
      const patched = patchPolicy(command, request, policy)
      const state = Array.map(command.state, (candidate) =>
        Match.value(candidate.id === policy.id).pipe(
          Match.when(true, () => patched),
          Match.when(false, () => candidate),
          Match.exhaustive,
        ))
      return NotificationPolicyApplied.make({ state, status: 200, body: successEnvelope({ id: patched.id }) })
    },
  })

const deletePolicy = (
  command: NotificationPolicyCommand,
  request: DeleteNotificationPolicy,
): NotificationPolicyOutcome =>
  Option.match(findPolicy(command.state, request.policy_id), {
    onNone: () => notFound(command.state),
    onSome: (policy) =>
      NotificationPolicyApplied.make({
        state: Array.filter(command.state, (candidate) => candidate.id !== policy.id),
        status: 200,
        body: successEnvelope({}),
      }),
  })

const decide = (command: NotificationPolicyCommand): Result.Result<NotificationPolicyOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListNotificationPolicies', () => listPolicies(command)),
      Match.tag('CreateNotificationPolicy', (request) => createPolicy(command, request)),
      Match.tag('GetNotificationPolicy', (request) => getPolicy(command, request)),
      Match.tag('UpdateNotificationPolicy', (request) => updatePolicy(command, request)),
      Match.tag('DeleteNotificationPolicy', (request) => deletePolicy(command, request)),
      Match.exhaustive,
    ),
  )

export const notificationPolicy = Workflow.make({
  command: NotificationPolicyCommand,
  decision: NotificationPolicyOutcome,
  error: Schema.Never,
  decide,
})
