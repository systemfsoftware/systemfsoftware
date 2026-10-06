import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import type { EmulatorState } from '../state/emulator-state.js'
import {
  CreateDestination,
  DeleteDestination,
  DestinationCommand,
  ListDestinations,
  UpdateDestination,
} from '../state/observability-destination.schema.js'
import type { DestinationRequest, ObservabilityDestinationState } from '../state/observability-destination.schema.js'
import { observabilityDestination } from '../state/observability-destination.workflow.js'

type DestinationInput = { readonly newId: string; readonly now: string; readonly state: EmulatorState }

const runDestination = (
  input: DestinationInput,
  request: DestinationRequest,
): Settled<ObservabilityDestinationState> => {
  const outcome = Result.getOrThrow(
    observabilityDestination(
      DestinationCommand.make({
        newId: input.newId,
        now: input.now,
        request,
        state: input.state.observabilityDestinations,
      }),
    ),
  )
  return settledOf(outcome)
}

const applyDestination = (
  operation: string,
  isWrite: boolean,
  decide: (input: DestinationInput) => Settled<ObservabilityDestinationState>,
) =>
  settleOperation({
    slot: 'observabilityDestinations',
    operation,
    isWrite,
    decide,
  })

export const observabilityDestinationHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Destinations',
  (handlers) =>
    handlers
      .handle('destinationList', ({ params, query }) =>
        applyDestination('destinationList', false, (input) =>
          runDestination(
            input,
            ListDestinations.make({
              account_id: params.account_id,
              order: query.order,
              orderBy: query.orderBy,
              page: query.page,
              perPage: query.perPage,
            }),
          )))
      .handle('destinationCreate', ({ params, payload }) =>
        applyDestination('destinationCreate', true, (input) =>
          runDestination(input, CreateDestination.make({ account_id: params.account_id, body: payload }))))
      .handle('destinationsDelete', ({ params }) =>
        applyDestination('destinationsDelete', true, (input) =>
          runDestination(input, DeleteDestination.make({ account_id: params.account_id, slug: params.slug }))))
      .handle('destinationUpdate', ({ params, payload }) =>
        applyDestination('destinationUpdate', true, (input) =>
          runDestination(
            input,
            UpdateDestination.make({ account_id: params.account_id, body: payload, slug: params.slug }),
          ))),
)
