import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import { ContainerImageCommand, PrepareContainerImage } from '../state/container-image.schema.js'
import type { ContainerImageRequest } from '../state/container-image.schema.js'
import { containerImage } from '../state/container-image.workflow.js'

const applyContainerImage = (operation: string, request: ContainerImageRequest) =>
  settleOperation({
    slot: 'containerImages',
    operation,
    isWrite: false,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        containerImage(
          ContainerImageCommand.make({
            now: input.now,
            newId: input.newId,
            state: input.state.containerImages,
            request,
          }),
        ),
      )
      return settledOf(outcome)
    },
  })

export const containerImagesHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Container Images',
  (handlers) =>
    handlers.handle('prepareContainerImage', ({ params, payload }) =>
      applyContainerImage(
        'prepareContainerImage',
        PrepareContainerImage.make({ account_id: params.account_id, image: payload.image }),
      )),
)
