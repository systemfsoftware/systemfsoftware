import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect, Match } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'
import { settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import type { EmulatorState } from '../state/emulator-state.js'
import { EntitlementCommand } from '../state/entitlement.schema.js'
import { judgeEntitlement } from '../state/judge-entitlement.workflow.js'
import {
  CreateSpectrumApp,
  DeleteSpectrumApp,
  GetSpectrumApp,
  ListSpectrumApps,
  ReplaceSpectrumApp,
  SpectrumCommand,
} from '../state/spectrum-app.schema.js'
import type { SpectrumAppState, SpectrumRequest } from '../state/spectrum-app.schema.js'
import { spectrumApp } from '../state/spectrum-app.workflow.js'

type SpectrumInput = { readonly newId: string; readonly now: string; readonly state: EmulatorState }

const runSpectrum = (input: SpectrumInput, request: SpectrumRequest): Settled<SpectrumAppState> => {
  const outcome = Result.getOrThrow(
    spectrumApp(
      SpectrumCommand.make({ newId: input.newId, now: input.now, request, state: input.state.spectrumApps }),
    ),
  )
  return { body: outcome.body, product: outcome.state, status: outcome.status }
}

const gatedSpectrum = (input: SpectrumInput, request: SpectrumRequest): Settled<SpectrumAppState> =>
  Match.value(
    Result.getOrThrow(
      judgeEntitlement(EntitlementCommand.make({ product: 'spectrum', seeds: input.state.entitlements })),
    ),
  ).pipe(
    Match.tags({
      Entitled: () => runSpectrum(input, request),
      AccessPending: (pending) => ({
        body: failureEnvelope({ code: pending.code, message: pending.message }),
        product: input.state.spectrumApps,
        status: 400,
      }),
    }),
    Match.exhaustive,
  )

const applySpectrum = (
  operation: string,
  isWrite: boolean,
  decide: (input: SpectrumInput) => Settled<SpectrumAppState>,
) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<SpectrumAppState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, spectrumApps: product }),
      decide,
    })
  })

export const spectrumApplicationHandlers = HttpApiBuilder.group(CloudflareApi, 'Spectrum Applications', (handlers) =>
  handlers
    .handle('spectrumApplicationsListSpectrumApplications', ({ params, query }) =>
      applySpectrum('spectrumApplicationsListSpectrumApplications', false, (input) =>
        gatedSpectrum(
          input,
          ListSpectrumApps.make({ page: query.page, per_page: query.per_page, zone_id: params.zone_id }),
        )))
    .handle('spectrumApplicationsCreateSpectrumApplicationUsingANameForTheOrigin', ({ params, payload }) =>
      applySpectrum('spectrumApplicationsCreateSpectrumApplicationUsingANameForTheOrigin', true, (input) =>
        gatedSpectrum(input, CreateSpectrumApp.make({ body: payload, zone_id: params.zone_id }))))
    .handle('spectrumApplicationsGetSpectrumApplicationConfiguration', ({ params }) =>
      applySpectrum('spectrumApplicationsGetSpectrumApplicationConfiguration', false, (input) =>
        gatedSpectrum(input, GetSpectrumApp.make({ app_id: params.app_id, zone_id: params.zone_id }))))
    .handle('spectrumApplicationsUpdateSpectrumApplicationConfigurationUsingANameForTheOrigin', ({ params, payload }) =>
      applySpectrum(
        'spectrumApplicationsUpdateSpectrumApplicationConfigurationUsingANameForTheOrigin',
        true,
        (input) =>
          gatedSpectrum(
            input,
            ReplaceSpectrumApp.make({ app_id: params.app_id, body: payload, zone_id: params.zone_id }),
          ),
      ))
    .handle('spectrumApplicationsDeleteSpectrumApplication', ({ params }) =>
      applySpectrum('spectrumApplicationsDeleteSpectrumApplication', true, (input) =>
        gatedSpectrum(input, DeleteSpectrumApp.make({ app_id: params.app_id, zone_id: params.zone_id })))))
