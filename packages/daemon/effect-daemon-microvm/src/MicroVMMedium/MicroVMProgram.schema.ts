import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Schema } from 'effect'

export const WorkloadCommand = Schema.NonEmptyArray(Schema.String)
export type WorkloadCommand = typeof WorkloadCommand.Type

export const MicroVMWorkload = Schema.Struct({
  image: MicroVM.ImageReference,
  command: WorkloadCommand,
  readyOnStdout: Schema.optional(Schema.NonEmptyString),
})
export type MicroVMWorkload = typeof MicroVMWorkload.Type
