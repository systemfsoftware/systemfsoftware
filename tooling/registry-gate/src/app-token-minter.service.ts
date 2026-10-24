import { Context, type Effect } from 'effect'
import type { MintedToken } from './AppToken.schema.js'
import type { TokenMintFailed } from './RegistryGateError.schema.js'

export class AppTokenMinter extends Context.Service<AppTokenMinter, {
  readonly mint: Effect.Effect<MintedToken, TokenMintFailed>
}>()('@systemfsoftware/registry-gate/AppTokenMinter') {}
