import { Schema } from 'effect'

const SandboxPrincipal = Schema.Union([
  Schema.TaggedStruct('Anonymous', {}),
  Schema.TaggedStruct('Person', { subject: Schema.String, scopes: Schema.Array(Schema.String) }),
])

const SandboxLifetime = Schema.Union([
  Schema.TaggedStruct('Request', {}),
  Schema.TaggedStruct('Session', { ttlSeconds: Schema.Int }),
])

export const SandboxRunRequest = Schema.Struct({
  program: Schema.String,
  programId: Schema.String,
  lifetime: SandboxLifetime,
  allow: Schema.Array(Schema.String),
  principal: SandboxPrincipal,
  catalogVersion: Schema.String,
  timeoutMs: Schema.Int,
  cpuMs: Schema.Int,
})
export type SandboxRunRequest = typeof SandboxRunRequest.Type

export const SandboxResponse = Schema.Struct({
  _tag: Schema.String,
  host: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  issue: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Json),
})
export type SandboxResponse = typeof SandboxResponse.Type
