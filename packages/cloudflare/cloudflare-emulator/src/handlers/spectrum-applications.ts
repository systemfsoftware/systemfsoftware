import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import type { EmulatorState } from '../state/emulator-state.js'
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
import { entitlementGate } from './entitlement-gate.js'

type SpectrumInput = { readonly newId: string; readonly now: string; readonly state: EmulatorState }

const runSpectrum = (input: SpectrumInput, request: SpectrumRequest): Settled<SpectrumAppState> => {
  const outcome = Result.getOrThrow(
    spectrumApp(
      SpectrumCommand.make({ newId: input.newId, now: input.now, request, state: input.state.spectrumApps }),
    ),
  )
  return settledOf(outcome)
}

const gatedSpectrum = (input: SpectrumInput, request: SpectrumRequest): Settled<SpectrumAppState> =>
  entitlementGate(() => runSpectrum(input, request), {
    product: 'spectrum',
    state: input.state,
    unchanged: input.state.spectrumApps,
  })

const applySpectrum = (
  operation: string,
  isWrite: boolean,
  decide: (input: SpectrumInput) => Settled<SpectrumAppState>,
) =>
  settleOperation({
    slot: 'spectrumApps',
    operation,
    isWrite,
    decide,
  })

export const spectrumApplicationHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Spectrum Applications',
  (handlers) =>
    handlers
      .handle('spectrumApplicationsListSpectrumApplications', ({ params, query }) =>
        applySpectrum('spectrumApplicationsListSpectrumApplications', false, (input) =>
          gatedSpectrum(
            input,
            ListSpectrumApps.make({ page: query.page, per_page: query.per_page, zone_id: params.zone_id }),
          )))
      .handle(
        'spectrumApplicationsCreateSpectrumApplicationUsingANameForTheOrigin',
        ({ params, payload }) =>
          applySpectrum('spectrumApplicationsCreateSpectrumApplicationUsingANameForTheOrigin', true, (input) =>
            gatedSpectrum(input, CreateSpectrumApp.make({ body: payload, zone_id: params.zone_id }))),
      )
      .handle(
        'spectrumApplicationsGetSpectrumApplicationConfiguration',
        ({ params }) =>
          applySpectrum('spectrumApplicationsGetSpectrumApplicationConfiguration', false, (input) =>
            gatedSpectrum(input, GetSpectrumApp.make({ app_id: params.app_id, zone_id: params.zone_id }))),
      )
      .handle(
        'spectrumApplicationsUpdateSpectrumApplicationConfigurationUsingANameForTheOrigin',
        ({ params, payload }) =>
          applySpectrum(
            'spectrumApplicationsUpdateSpectrumApplicationConfigurationUsingANameForTheOrigin',
            true,
            (input) =>
              gatedSpectrum(
                input,
                ReplaceSpectrumApp.make({ app_id: params.app_id, body: payload, zone_id: params.zone_id }),
              ),
          ),
      )
      .handle(
        'spectrumApplicationsDeleteSpectrumApplication',
        ({ params }) =>
          applySpectrum('spectrumApplicationsDeleteSpectrumApplication', true, (input) =>
            gatedSpectrum(input, DeleteSpectrumApp.make({ app_id: params.app_id, zone_id: params.zone_id }))),
      ),
)
