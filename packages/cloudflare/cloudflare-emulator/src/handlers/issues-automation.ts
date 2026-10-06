import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { DateTime, Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  CreateIssuesAutomation,
  DeleteIssuesAutomation,
  GetIssuesAutomation,
  IssuesAutomationCommand,
  ListIssuesAutomations,
  UpdateIssuesAutomation,
} from '../state/issues-automation.schema.js'
import type { IssuesAutomationRequest, IssuesAutomationState } from '../state/issues-automation.schema.js'
import { issuesAutomation } from '../state/issues-automation.workflow.js'

const nowMillisOf = (iso: string): number => DateTime.toEpochMillis(DateTime.makeUnsafe(iso))

const applyIssues = (operation: string, isWrite: boolean, request: IssuesAutomationRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<IssuesAutomationState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, issuesAutomations: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          issuesAutomation(
            IssuesAutomationCommand.make({
              nowMillis: nowMillisOf(input.now),
              newId: input.newId,
              automations: input.state.issuesAutomations,
              policies: input.state.notificationPolicies,
              request,
            }),
          ),
        )
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
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
