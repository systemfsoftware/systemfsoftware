import { Context, type Effect, type Redacted } from 'effect'
import type { TokenMintFailed } from './RegistryGateError.schema.js'

export class DopplerOidcToken extends Context.Service<DopplerOidcToken, {
  readonly token: Effect.Effect<Redacted.Redacted<string>, TokenMintFailed>
}>()('@systemfsoftware/registry-gate/DopplerOidcToken') {}
