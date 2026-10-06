import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import type {
  CreateApplicationRequestJson,
  ModifyApplicationRequestJson,
} from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import {
  ContainerApplicationCommand,
  ContainerApplicationState,
  CreateContainerApplication,
  DeleteContainerApplication,
  GetContainerApplication,
  ListContainerApplications,
  ModifyContainerApplication,
} from '../state/container-application.schema.js'
import type { ContainerApplicationRequest } from '../state/container-application.schema.js'
import { containerApplication } from '../state/container-application.workflow.js'
import { EmulatorStore } from '../state/emulator-store.js'

const applyContainerApplication = (
  operation: string,
  isWrite: boolean,
  request: ContainerApplicationRequest,
) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<ContainerApplicationState>({
      store,
      operation,
      isWrite,
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

const createRequest = (accountId: string, payload: CreateApplicationRequestJson): CreateContainerApplication =>
  payload.scheduling_policy === 'durable_object'
    ? CreateContainerApplication.make({
      account_id: accountId,
      configuration: payload.configuration,
      durable_objects: payload.durable_objects,
      name: payload.name,
      observability: payload.observability,
      scheduling_policy: 'durable_object',
    })
    : CreateContainerApplication.make({
      account_id: accountId,
      configuration: payload.configuration,
      constraints: payload.constraints,
      durable_objects: payload.durable_objects,
      instances: payload.instances,
      max_instances: payload.max_instances,
      name: payload.name,
      observability: payload.observability,
      rollout_active_grace_period: payload.rollout_active_grace_period,
      scheduling_policy: 'default',
    })

const modifyRequest = (applicationId: string, payload: ModifyApplicationRequestJson): ModifyContainerApplication =>
  ModifyContainerApplication.make({
    application_id: applicationId,
    configuration: payload.configuration,
    constraints: payload.constraints,
    max_instances: payload.max_instances,
    observability: payload.observability,
    rollout_active_grace_period: payload.rollout_active_grace_period,
  })

export const containerApplicationsHandlers = HttpApiBuilder.group(CloudflareApi, 'Applications', (handlers) =>
  handlers
    .handle('listApplications', ({ query }) =>
      applyContainerApplication(
        'listApplications',
        false,
        ListContainerApplications.make({
          image: query.image,
          name: query.name,
          page_token: query.page_token,
          per_page: query.per_page,
        }),
      ))
    .handle('createApplication', ({ params, payload }) =>
      applyContainerApplication('createApplication', true, createRequest(params.account_id, payload)))
    .handle('getApplication', ({ params }) =>
      applyContainerApplication(
        'getApplication',
        false,
        GetContainerApplication.make({ application_id: params.application_id }),
      ))
    .handle('deleteApplication', ({ params }) =>
      applyContainerApplication(
        'deleteApplication',
        true,
        DeleteContainerApplication.make({ application_id: params.application_id }),
      ))
    .handle('modifyApplication', ({ params, payload }) =>
      applyContainerApplication('modifyApplication', true, modifyRequest(params.application_id, payload))))
