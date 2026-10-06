import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateIssuesAutomation,
  DeleteIssuesAutomation,
  GetIssuesAutomation,
  IssuesAutomationApplied,
  IssuesAutomationCommand,
  IssuesAutomationOutcome,
  IssuesAutomationRefused,
  ListIssuesAutomations,
  UpdateIssuesAutomation,
} from './issues-automation.schema.js'
import type {
  IssuesAutomation,
  IssuesAutomationScope,
  IssuesAutomationState,
  IssuesAutomationTriggerType,
} from './issues-automation.schema.js'

const notFound = (state: IssuesAutomationState): IssuesAutomationRefused =>
  IssuesAutomationRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'Not found' }) })

const orNull = <A>(value: A | undefined): A | null => Option.getOrElse(Option.fromUndefinedOr(value), () => null)

const triggerTypeOf = (seconds: number | undefined): IssuesAutomationTriggerType =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(seconds), () => 'recurrence_after_inactivity'),
    () => 'occurrence_threshold',
  )

const scopeOf = (service: string | undefined): IssuesAutomationScope =>
  Option.getOrElse(Option.map(Option.fromUndefinedOr(service), () => 'service'), () => 'account')

const nameOf = (name: string | undefined, id: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(name), () => `automation-${id}`)

const findAutomation = (state: IssuesAutomationState, id: string): Option.Option<IssuesAutomation> =>
  Array.findFirst(state, (automation) => automation.id === id)

const policyExists = (command: IssuesAutomationCommand, policyId: string): boolean =>
  Option.isSome(Array.findFirst(command.policies, (policy) => policy.id === policyId))

const buildAutomation = (
  command: IssuesAutomationCommand,
  request: CreateIssuesAutomation | UpdateIssuesAutomation,
  id: string,
  created: number,
  revision: number,
): IssuesAutomation => ({
  ansPolicyId: request.policyId,
  created,
  createdByUserId: null,
  enabled: Option.getOrElse(Option.fromUndefinedOr(request.enabled), () => true),
  id,
  inactivitySeconds: orNull(request.afterInactivitySeconds),
  name: nameOf(request.name, id),
  revision,
  scope: scopeOf(request.service),
  service: orNull(request.service),
  serviceType: null,
  threshold: orNull(request.afterOccurrences),
  triggerType: triggerTypeOf(request.afterInactivitySeconds),
  updated: command.nowMillis,
  updatedByUserId: null,
})

const automationView = (automation: IssuesAutomation): Schema.Json => ({
  ansPolicyId: automation.ansPolicyId,
  created: automation.created,
  createdByUserId: automation.createdByUserId,
  enabled: automation.enabled,
  id: automation.id,
  inactivitySeconds: automation.inactivitySeconds,
  name: automation.name,
  revision: automation.revision,
  scope: automation.scope,
  service: automation.service,
  serviceType: automation.serviceType,
  threshold: automation.threshold,
  triggerType: automation.triggerType,
  updated: automation.updated,
  updatedByUserId: automation.updatedByUserId,
})

const matchesService =
  (service: string | undefined) =>
  (automation: IssuesAutomation): boolean =>
    Option.match(Option.fromUndefinedOr(service), {
      onNone: () => true,
      onSome: (wanted) => automation.service === wanted,
    })

const listAutomations = (command: IssuesAutomationCommand, request: ListIssuesAutomations): IssuesAutomationOutcome => {
  const filtered = Array.filter(command.automations, matchesService(request.service))
  return IssuesAutomationApplied.make({
    state: command.automations,
    status: 200,
    body: successEnvelope({ automations: Array.map(filtered, automationView) }),
  })
}

const createAutomation = (command: IssuesAutomationCommand, request: CreateIssuesAutomation): IssuesAutomationOutcome =>
  Match.value(policyExists(command, request.policyId)).pipe(
    Match.when(false, () => notFound(command.automations)),
    Match.when(true, () => {
      const automation = buildAutomation(command, request, command.newId, command.nowMillis, 1)
      return IssuesAutomationApplied.make({
        state: Array.append(command.automations, automation),
        status: 200,
        body: successEnvelope({ automation: automationView(automation) }),
      })
    }),
    Match.exhaustive,
  )

const getAutomation = (command: IssuesAutomationCommand, request: GetIssuesAutomation): IssuesAutomationOutcome =>
  Option.match(findAutomation(command.automations, request.automationId), {
    onNone: () => notFound(command.automations),
    onSome: (automation) =>
      IssuesAutomationApplied.make({
        state: command.automations,
        status: 200,
        body: successEnvelope({ automation: automationView(automation) }),
      }),
  })

const updateAutomation = (command: IssuesAutomationCommand, request: UpdateIssuesAutomation): IssuesAutomationOutcome =>
  Option.match(findAutomation(command.automations, request.automationId), {
    onNone: () => notFound(command.automations),
    onSome: (existing) =>
      Match.value(policyExists(command, request.policyId)).pipe(
        Match.when(false, () => notFound(command.automations)),
        Match.when(true, () => {
          const replacement = buildAutomation(command, request, existing.id, existing.created, existing.revision + 1)
          const state = Array.map(command.automations, (candidate) =>
            Match.value(candidate.id === existing.id).pipe(
              Match.when(true, () => replacement),
              Match.when(false, () => candidate),
              Match.exhaustive,
            ))
          return IssuesAutomationApplied.make({
            state,
            status: 200,
            body: successEnvelope({ automation: automationView(replacement) }),
          })
        }),
        Match.exhaustive,
      ),
  })

const deleteAutomation = (command: IssuesAutomationCommand, request: DeleteIssuesAutomation): IssuesAutomationOutcome =>
  Option.match(findAutomation(command.automations, request.automationId), {
    onNone: () => notFound(command.automations),
    onSome: (automation) =>
      IssuesAutomationApplied.make({
        state: Array.filter(command.automations, (candidate) => candidate.id !== automation.id),
        status: 200,
        body: successEnvelope({ automation: automationView(automation) }),
      }),
  })

const decide = (command: IssuesAutomationCommand): Result.Result<IssuesAutomationOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListIssuesAutomations', (request) => listAutomations(command, request)),
      Match.tag('CreateIssuesAutomation', (request) => createAutomation(command, request)),
      Match.tag('GetIssuesAutomation', (request) => getAutomation(command, request)),
      Match.tag('UpdateIssuesAutomation', (request) => updateAutomation(command, request)),
      Match.tag('DeleteIssuesAutomation', (request) => deleteAutomation(command, request)),
      Match.exhaustive,
    ),
  )

export const issuesAutomation = Workflow.make({
  command: IssuesAutomationCommand,
  decision: IssuesAutomationOutcome,
  error: Schema.Never,
  decide,
})
