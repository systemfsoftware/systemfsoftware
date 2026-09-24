import { Schema as S } from 'effect'
import { RpcMiddleware } from 'effect/unstable/rpc'
import { AuthServiceUnavailable, Unauthorized } from '../fulfillment/decision.schema.js'
import type { AuthContext } from '../ports/AuthContext.service.js'

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, { provides: AuthContext }>()(
  '@systemfsoftware/example-inventory-fulfillment/rpc/AuthMiddleware',
  { error: S.Union([Unauthorized, AuthServiceUnavailable]) },
) {}
