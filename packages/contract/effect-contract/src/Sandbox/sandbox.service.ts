import { Context, type Effect, type Schema } from 'effect'
import type { SandboxError, SandboxInput } from './sandbox.schema.js'

export interface SandboxShape {
  readonly run: (input: SandboxInput) => Effect.Effect<Schema.Json, SandboxError>
}

export class Sandbox extends Context.Service<Sandbox, SandboxShape>()('@systemfsoftware/effect-contract/Sandbox') {}
