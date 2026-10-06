import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const ContainerImageOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/ContainerImageOutcome',
)
type ContainerImageOutcomeTypeId = typeof ContainerImageOutcomeTypeId

export const ContainerImagePreparationStatus = Schema.Literals(['pending', 'ready', 'error'])
export type ContainerImagePreparationStatus = typeof ContainerImagePreparationStatus.Type

export const ContainerImagePreparation = Schema.Struct({
  artifact_digest: Schema.optional(Schema.String),
  image: Schema.String,
  reason: Schema.optional(Schema.String),
  status: ContainerImagePreparationStatus,
})
export type ContainerImagePreparation = typeof ContainerImagePreparation.Type

export const ContainerImageState = Schema.Array(ContainerImagePreparation)
export type ContainerImageState = typeof ContainerImageState.Type

export const emptyContainerImageState: ContainerImageState = []

export class PrepareContainerImage extends Schema.TaggedClass<PrepareContainerImage>()('PrepareContainerImage', {
  account_id: Schema.String,
  image: Schema.String,
}) {}

export const ContainerImageRequest = PrepareContainerImage
export type ContainerImageRequest = typeof ContainerImageRequest.Type

export class ContainerImageApplied extends Schema.TaggedClass<ContainerImageApplied>()(
  'ContainerImageApplied',
  {
    state: ContainerImageState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [ContainerImageOutcomeTypeId] = ContainerImageOutcomeTypeId
}

export class ContainerImageRefused extends Schema.TaggedClass<ContainerImageRefused>()(
  'ContainerImageRefused',
  {
    state: ContainerImageState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [ContainerImageOutcomeTypeId] = ContainerImageOutcomeTypeId
}

export const ContainerImageOutcome = Schema.Union([ContainerImageApplied, ContainerImageRefused])
export type ContainerImageOutcome = typeof ContainerImageOutcome.Type

export class ContainerImageCommand extends Schema.TaggedClass<ContainerImageCommand>()(
  'ContainerImageCommand',
  {
    now: Schema.String,
    newId: Schema.String,
    state: ContainerImageState,
    request: ContainerImageRequest,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
