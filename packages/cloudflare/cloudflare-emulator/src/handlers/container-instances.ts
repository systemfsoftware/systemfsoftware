import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  ContainerApplicationCommand,
  ContainerApplicationState,
  GetApplicationInstance,
  ListApplicationInstances,
} from '../state/container-application.schema.js'
import type { ContainerApplicationRequest } from '../state/container-application.schema.js'
import { containerApplication } from '../state/container-application.workflow.js'

const applyContainerInstance = (
  operation: string,
  request: ContainerApplicationRequest,
) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<ContainerApplicationState>({
      store,
      operation,
      isWrite: false,
      write: (state, product) => ({ ...state, containerApplications: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          containerApplication(
            ContainerApplicationCommand.make({
              now: input.now,
              newId: input.newId,
              state: input.state.containerApplications,
              request,
            }),
          ),
        )
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
  })

export const containerInstancesHandlers = HttpApiBuilder.group(CloudflareApi, 'Container Instances', (handlers) =>
  handlers
    .handle('listContainerInstances', ({ params, query }) =>
      applyContainerInstance(
        'listContainerInstances',
        ListApplicationInstances.make({
          application_id: params.application_id,
          name_prefix: query.name_prefix,
          page_token: query.page_token,
          per_page: query.per_page,
          state: query.state,
        }),
      ))
    .handle('getContainerInstance', ({ params }) =>
      applyContainerInstance(
        'getContainerInstance',
        GetApplicationInstance.make({
          application_id: params.application_id,
          instance_id: params.instance_id,
        }),
      )))
