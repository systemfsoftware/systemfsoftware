import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { answerTelemetryQuery } from '../state/answer-telemetry-query.workflow.js'
import { EmulatorStore } from '../state/emulator-store.js'
import { TelemetryCommand } from '../state/telemetry.schema.js'
import type { TelemetryQueryInput, TelemetryState } from '../state/telemetry.schema.js'

const applyTelemetry = (operation: string, account_id: string, query: TelemetryQueryInput) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<TelemetryState>({
      store,
      operation,
      isWrite: false,
      write: (state, product) => ({ ...state, telemetry: product }),
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
        return { body: outcome.body, product: outcome.state, status: outcome.status }
      },
    })
  })

export const telemetryQueryHandlers = HttpApiBuilder.group(CloudflareApi, 'Query run', (handlers) =>
  handlers
    .handle('telemetryQuery', ({ params, payload }) => applyTelemetry('telemetryQuery', params.account_id, payload)))
