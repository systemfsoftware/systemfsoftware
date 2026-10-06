import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import {
  ContainerApplicationCommand,
  GetApplicationInstance,
  ListApplicationInstances,
} from '../state/container-application.schema.js'
import type { ContainerApplicationRequest } from '../state/container-application.schema.js'
import { containerApplication } from '../state/container-application.workflow.js'

const applyContainerInstance = (
  operation: string,
  request: ContainerApplicationRequest,
) =>
  settleOperation({
    slot: 'containerApplications',
    operation,
    isWrite: false,
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
      return settledOf(outcome)
    },
  })

export const containerInstancesHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Container Instances',
  (handlers) =>
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
        )),
)
