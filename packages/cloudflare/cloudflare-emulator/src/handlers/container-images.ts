import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import { ContainerImageCommand, ContainerImageState, PrepareContainerImage } from '../state/container-image.schema.js'
import type { ContainerImageRequest } from '../state/container-image.schema.js'
import { containerImage } from '../state/container-image.workflow.js'

const applyContainerImage = (operation: string, request: ContainerImageRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<ContainerImageState>({
      store,
      operation,
      isWrite: false,
      write: (state, product) => ({ ...state, containerImages: product }),
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
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
  })

export const containerImagesHandlers = HttpApiBuilder.group(CloudflareApi, 'Container Images', (handlers) =>
  handlers.handle('prepareContainerImage', ({ params, payload }) =>
    applyContainerImage(
      'prepareContainerImage',
      PrepareContainerImage.make({ account_id: params.account_id, image: payload.image }),
    )))
