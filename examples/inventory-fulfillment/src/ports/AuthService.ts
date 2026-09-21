import type { Auth } from 'better-auth'
import { Context, Layer } from 'effect'
import { make as makeLive } from '../store/AuthServiceLive.js'

export class AuthService extends Context.Service<AuthService, Auth>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/AuthService',
) {
  static readonly Live = Layer.effect(this, makeLive)
}
