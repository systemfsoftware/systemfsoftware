import type { Auth } from 'better-auth'
import { Context } from 'effect'

export class AuthService extends Context.Service<AuthService, Auth>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/AuthService',
) {}
