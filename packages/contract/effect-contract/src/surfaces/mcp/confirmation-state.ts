import { Clock, Context, Effect, Schema } from 'effect'
import { Base64Url } from 'effect/encoding'
import * as Result from 'effect/Result'
import { type ConfirmationClaims, ConfirmationClaimsJson, InvalidRequestState } from './confirmation-state.schema.js'

const MAC_BYTES = 32
const CONFIRMATION_TTL_MS = 300_000
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export class McpConfirmationKey extends Context.Service<McpConfirmationKey, CryptoKey>()(
  '@systemfsoftware/effect-contract/mcp/McpConfirmationKey',
) {}

export const confirmationExpiry = (now: number): number => now + CONFIRMATION_TTL_MS

interface SignedState {
  readonly payload: Uint8Array
  readonly signature: Uint8Array
}

const malformed = (reason: string): InvalidRequestState => new InvalidRequestState({ reason })

const splitState = (bytes: Uint8Array): Result.Result<SignedState, InvalidRequestState> =>
  bytes.length <= MAC_BYTES
    ? Result.fail(malformed('the confirmation state is shorter than its signature'))
    : Result.succeed({
      payload: bytes.slice(0, bytes.length - MAC_BYTES),
      signature: bytes.slice(bytes.length - MAC_BYTES),
    })

const decodeState = (token: string): Result.Result<SignedState, InvalidRequestState> =>
  Result.match(Base64Url.decode(token), {
    onFailure: () => Result.fail(malformed('the confirmation state is not base64url')),
    onSuccess: splitState,
  })

const signBytes = (key: CryptoKey, bytes: Uint8Array): Effect.Effect<Uint8Array> =>
  Effect.promise(() =>
    globalThis.crypto.subtle.sign('HMAC', key, new Uint8Array(bytes)).then((buffer) => new Uint8Array(buffer))
  )

const verifyBytes = (key: CryptoKey, signature: Uint8Array, bytes: Uint8Array): Effect.Effect<boolean> =>
  Effect.promise(() => globalThis.crypto.subtle.verify('HMAC', key, new Uint8Array(signature), new Uint8Array(bytes)))

const joinBytes = (first: Uint8Array, second: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(first.length + second.length)
  joined.set(first)
  joined.set(second, first.length)
  return joined
}

export const signRequestState = (claims: ConfirmationClaims): Effect.Effect<string, never, McpConfirmationKey> =>
  Effect.gen(function*() {
    const key = yield* McpConfirmationKey
    const payload = yield* Effect.orDie(Schema.encodeEffect(ConfirmationClaimsJson)(claims))
    const payloadBytes = textEncoder.encode(payload)
    const signature = yield* signBytes(key, payloadBytes)
    return Base64Url.encode(joinBytes(payloadBytes, signature))
  })

const decodeClaims = (payload: Uint8Array): Effect.Effect<ConfirmationClaims, InvalidRequestState> =>
  Effect.gen(function*() {
    const claims = yield* Effect.mapError(
      Schema.decodeEffect(ConfirmationClaimsJson)(textDecoder.decode(payload)),
      () => malformed('the confirmation state is malformed'),
    )
    const now = yield* Clock.currentTimeMillis
    return yield* claims.expiresAt >= now
      ? Effect.succeed(claims)
      : Effect.fail(malformed('the confirmation state has expired'))
  })

export const verifyRequestState = (
  token: string,
): Effect.Effect<ConfirmationClaims, InvalidRequestState, McpConfirmationKey> =>
  Effect.gen(function*() {
    const key = yield* McpConfirmationKey
    const state = yield* Effect.fromResult(decodeState(token))
    const valid = yield* verifyBytes(key, state.signature, state.payload)
    return yield* valid
      ? decodeClaims(state.payload)
      : Effect.fail(malformed('the confirmation state signature does not match'))
  })

export const argumentDigest = (input: Schema.Json): Effect.Effect<string> =>
  Effect.gen(function*() {
    const text = yield* Effect.orDie(Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(input))
    const digest = yield* Effect.promise(() =>
      globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(text)).then((buffer) => new Uint8Array(buffer))
    )
    return Base64Url.encode(digest)
  })
