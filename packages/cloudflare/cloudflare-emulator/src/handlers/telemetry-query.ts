import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import { answerTelemetryQuery } from '../state/answer-telemetry-query.workflow.js'
import { TelemetryCommand } from '../state/telemetry.schema.js'
import type { TelemetryQueryInput } from '../state/telemetry.schema.js'

const applyTelemetry = (operation: string, account_id: string, query: TelemetryQueryInput) =>
  settleOperation({
    slot: 'telemetry',
    operation,
    isWrite: false,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        answerTelemetryQuery(
          TelemetryCommand.make({
            account_id,
            newId: input.newId,
            now: input.now,
            query,
            state: input.state.telemetry,
          }),
        ),
      )
      return settledOf(outcome)
    },
  })

export const telemetryQueryHandlers = HttpApiBuilder.group(CloudflareApi, 'Query run', (handlers) =>
  handlers
    .handle('telemetryQuery', ({ params, payload }) => applyTelemetry('telemetryQuery', params.account_id, payload)))
