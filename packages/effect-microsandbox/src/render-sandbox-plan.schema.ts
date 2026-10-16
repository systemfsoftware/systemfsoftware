import { Schema } from 'effect'
import { GuestPort } from './MicroVMSpec.schema.js'

export const PortBinding = Schema.Struct({
  guest: GuestPort,
  host: Schema.String,
  hostPort: Schema.Int,
})
export type PortBinding = typeof PortBinding.Type

const NetworkProfile = Schema.Literals(['public', 'host'])

export const SandboxPlan = Schema.Struct({
  name: Schema.String,
  image: Schema.String,
  envs: Schema.Record(Schema.String, Schema.String),
  cpus: Schema.optional(Schema.Int),
  memoryMiB: Schema.optional(Schema.Finite),
  workdir: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.Array(Schema.String)),
  mounts: Schema.Array(Schema.Struct({ guest: Schema.String, host: Schema.String })),
  portBindings: Schema.Array(PortBinding),
  networkProfiles: Schema.optional(Schema.Array(NetworkProfile)),
})
export type SandboxPlan = typeof SandboxPlan.Type
