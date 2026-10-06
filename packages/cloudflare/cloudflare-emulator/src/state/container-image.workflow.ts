import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  ContainerImageApplied,
  ContainerImageCommand,
  ContainerImageOutcome,
  ContainerImagePreparation,
  ContainerImageRefused,
  ContainerImageState,
  PrepareContainerImage,
} from './container-image.schema.js'

const digestAnchorPattern = /^[^@]+@sha256:[a-f0-9]{64}$/

const isDigestPinned = (image: string): boolean => digestAnchorPattern.test(image)

const artifactDigestOf = (image: string): string =>
  Option.getOrElse(Option.map(Array.get(image.split('@'), 1), (digest) => digest), () => '')

const pendingPreparation = (image: string): ContainerImagePreparation => ({ image, status: 'pending' })

const readyPreparation = (image: string): ContainerImagePreparation => ({
  artifact_digest: artifactDigestOf(image),
  image,
  status: 'ready',
})

const findPreparation = (state: ContainerImageState, image: string): Option.Option<ContainerImagePreparation> =>
  Array.findFirst(state, (preparation) => preparation.image === image)

const replacePreparation = (state: ContainerImageState, ready: ContainerImagePreparation): ContainerImageState =>
  Array.map(state, (preparation) =>
    Match.value(preparation.image === ready.image).pipe(
      Match.when(true, () => ready),
      Match.when(false, () => preparation),
      Match.exhaustive,
    ))

const refused = (state: ContainerImageState): ContainerImageRefused =>
  ContainerImageRefused.make({
    state,
    status: 400,
    body: failureEnvelope({ code: 1000, message: 'Image must be digest-pinned (name@sha256:<64 hex>).' }),
  })

const startPreparation = (command: ContainerImageCommand, request: PrepareContainerImage): ContainerImageOutcome => {
  const pending = pendingPreparation(request.image)
  return ContainerImageApplied.make({
    state: Array.append(command.state, pending),
    status: 202,
    body: successEnvelope(pending),
  })
}

const observePreparation = (command: ContainerImageCommand, request: PrepareContainerImage): ContainerImageOutcome => {
  const ready = readyPreparation(request.image)
  return ContainerImageApplied.make({
    state: replacePreparation(command.state, ready),
    status: 200,
    body: successEnvelope(ready),
  })
}

const prepareImage = (command: ContainerImageCommand, request: PrepareContainerImage): ContainerImageOutcome =>
  Match.value(isDigestPinned(request.image)).pipe(
    Match.when(false, () => refused(command.state)),
    Match.when(true, () =>
      Option.match(findPreparation(command.state, request.image), {
        onNone: () => startPreparation(command, request),
        onSome: () => observePreparation(command, request),
      })),
    Match.exhaustive,
  )

const decide = (command: ContainerImageCommand): Result.Result<ContainerImageOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('PrepareContainerImage', (request) => prepareImage(command, request)),
      Match.exhaustive,
    ),
  )

export const containerImage = Workflow.make({
  command: ContainerImageCommand,
  decision: ContainerImageOutcome,
  error: Schema.Never,
  decide,
})
