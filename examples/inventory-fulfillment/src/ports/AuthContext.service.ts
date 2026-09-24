import { Context } from 'effect'

export interface AuthContextService {
  readonly userId: string
}

export class AuthContext extends Context.Service<AuthContext, AuthContextService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/AuthContext',
) {}
