import { Context, type Effect } from 'effect'
import type { DialEvidence, HttpEvidence } from './DialEvidence.schema.js'
import type { PortBinding } from './Port.schema.js'

export class HostProber extends Context.Service<HostProber, {
  readonly dial: (binding: PortBinding) => Effect.Effect<DialEvidence>
  readonly exchange: (binding: PortBinding, path: string) => Effect.Effect<HttpEvidence>
}>()('@systemfsoftware/effect-readiness/HostProber') {}
