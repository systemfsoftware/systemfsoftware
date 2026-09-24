import { Context, type Effect, type Option } from 'effect'
import type { AuthServiceUnavailable } from '../fulfillment/decision.schema.js'

export interface AuthSession {
  readonly userId: string
}

export interface AuthServiceService {
  readonly resolveSession: (
    headers: Headers,
  ) => Effect.Effect<Option.Option<AuthSession>, AuthServiceUnavailable>
  readonly handle: (request: Request) => Effect.Effect<Response, AuthServiceUnavailable>
}

export class AuthService extends Context.Service<AuthService, AuthServiceService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/AuthService',
) {}
