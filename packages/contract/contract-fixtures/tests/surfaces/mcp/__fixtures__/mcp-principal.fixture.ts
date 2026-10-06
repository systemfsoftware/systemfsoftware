import { Principal } from '@systemfsoftware/effect-contract'
import { Effect, Layer, Option, Schema } from 'effect'

export const person = Effect.runSync(
  Effect.orDie(
    Schema.decodeEffect(Principal.Person)({
      _tag: 'Person',
      subject: 'user-42',
      scopes: ['write', 'write:balance', 'read:statement', 'read:balance'],
    }),
  ),
)

export const BEARER_TOKEN = 'fixture-token'

export const verifierLayer: Layer.Layer<Principal.TokenVerifier> = Layer.succeed(Principal.TokenVerifier)({
  verify: (token) =>
    Effect.succeed(
      Option.match(Option.fromUndefinedOr(token), {
        onNone: () => new Principal.TokenMissing({}),
        onSome: () => new Principal.TokenVerified({ principal: person }),
      }),
    ),
})
