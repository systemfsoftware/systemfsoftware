import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Schema } from 'effect'

export const WorkloadCommand = Schema.NonEmptyArray(Schema.String)
export type WorkloadCommand = typeof WorkloadCommand.Type

export class MicroVMWorkload extends Schema.Class<MicroVMWorkload>('MicroVMWorkload')({
  image: MicroVM.ImageReference,
  command: WorkloadCommand,
  readyOnStdout: Schema.optional(Schema.NonEmptyString),
}) {}
