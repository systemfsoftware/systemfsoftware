import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { DateTime } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import {
  CreateIssuesAutomation,
  DeleteIssuesAutomation,
  GetIssuesAutomation,
  IssuesAutomationCommand,
  ListIssuesAutomations,
  UpdateIssuesAutomation,
} from '../state/issues-automation.schema.js'
import type { IssuesAutomationRequest } from '../state/issues-automation.schema.js'
import { issuesAutomation } from '../state/issues-automation.workflow.js'
import { entitlementGate } from './entitlement-gate.js'

const nowMillisOf = (iso: string): number => DateTime.toEpochMillis(DateTime.makeUnsafe(iso))

const applyIssues = (operation: string, isWrite: boolean, request: IssuesAutomationRequest) =>
  settleOperation({
    slot: 'issuesAutomations',
    operation,
    isWrite,
    decide: (input) =>
      entitlementGate(
        () =>
          issuesAutomation(
            IssuesAutomationCommand.make({
              nowMillis: nowMillisOf(input.now),
              newId: input.newId,
              automations: input.state.issuesAutomations,
              policies: input.state.notificationPolicies,
              request,
            }),
          ).pipe(Result.getOrThrow, settledOf),
        { product: 'issues', state: input.state, unchanged: input.state.issuesAutomations },
      ),
  })

export const issuesAutomationHandlers = HttpApiBuilder.group(CloudflareApi, 'Issues', (handlers) =>
  handlers
    .handle('issuesAutomationsList', ({ query }) =>
      applyIssues('issuesAutomationsList', false, ListIssuesAutomations.make({ service: query.service })))
    .handle('issuesAutomationsCreate', ({ payload }) =>
      applyIssues(
        'issuesAutomationsCreate',
        true,
        CreateIssuesAutomation.make({
          afterInactivitySeconds: payload.afterInactivitySeconds,
          afterOccurrences: payload.afterOccurrences,
          enabled: payload.enabled,
          name: payload.name,
          policyId: payload.policyId,
          service: payload.service,
        }),
      ))
    .handle('issuesAutomationsGet', ({ params }) =>
      applyIssues('issuesAutomationsGet', false, GetIssuesAutomation.make({ automationId: params.automationId })))
    .handle('issuesAutomationsUpdate', ({ params, payload }) =>
      applyIssues(
        'issuesAutomationsUpdate',
        true,
        UpdateIssuesAutomation.make({
          automationId: params.automationId,
          afterInactivitySeconds: payload.afterInactivitySeconds,
          afterOccurrences: payload.afterOccurrences,
          enabled: payload.enabled,
          name: payload.name,
          policyId: payload.policyId,
          service: payload.service,
        }),
      ))
    .handle('issuesAutomationsDelete', ({ params }) =>
      applyIssues('issuesAutomationsDelete', true, DeleteIssuesAutomation.make({ automationId: params.automationId }))))
