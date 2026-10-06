import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  DeleteTracingRules,
  GetTracingRules,
  GetTracingSettings,
  PatchTracingSettings,
  ReplaceTracingRules,
  ResetTracingSettings,
  TracingCommand,
} from '../state/zone-tracing.schema.js'
import type { TracingRequest, ZoneTracingState } from '../state/zone-tracing.schema.js'
import { zoneTracing } from '../state/zone-tracing.workflow.js'

const applyTracing = (operation: string, isWrite: boolean, request: TracingRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<ZoneTracingState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, zoneTracing: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          zoneTracing(TracingCommand.make({ now: input.now, request, state: input.state.zoneTracing })),
        )
        return { body: outcome.body, product: outcome.state, status: outcome.status }
      },
    })
  })

export const observabilityHandlers = HttpApiBuilder.group(CloudflareApi, 'Observability', (handlers) =>
  handlers
    .handle('zoneObservabilityTracingSettingsGet', ({ params }) =>
      applyTracing('zoneObservabilityTracingSettingsGet', false, GetTracingSettings.make({ zone_id: params.zone_id })))
    .handle('zoneObservabilityTracingSettingsDelete', ({ params }) =>
      applyTracing(
        'zoneObservabilityTracingSettingsDelete',
        true,
        ResetTracingSettings.make({ zone_id: params.zone_id }),
      ))
    .handle('zoneObservabilityTracingSettingsUpdate', ({ params, payload }) =>
      applyTracing(
        'zoneObservabilityTracingSettingsUpdate',
        true,
        PatchTracingSettings.make({ patch: payload, zone_id: params.zone_id }),
      ))
    .handle('zoneObservabilityTracingRulesGet', ({ params }) =>
      applyTracing('zoneObservabilityTracingRulesGet', false, GetTracingRules.make({ zone_id: params.zone_id })))
    .handle('zoneObservabilityTracingRulesUpdate', ({ params, payload }) =>
      applyTracing(
        'zoneObservabilityTracingRulesUpdate',
        true,
        ReplaceTracingRules.make({ rules: payload.rules, zone_id: params.zone_id }),
      ))
    .handle('zoneObservabilityTracingRulesDelete', ({ params }) =>
      applyTracing('zoneObservabilityTracingRulesDelete', true, DeleteTracingRules.make({ zone_id: params.zone_id }))))
