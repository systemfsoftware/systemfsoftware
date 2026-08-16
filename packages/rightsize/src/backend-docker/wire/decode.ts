/**
 * Loud decode for Docker Engine API response bodies.
 *
 * A wire declaration states the shape the daemon's JSON must have; decoding
 * it must never fall back to a default. This module turns every decode
 * failure — a body that is not JSON, or a JSON body that violates the
 * declared shape — into one tagged {@link WireDecodeError} carrying the
 * declaring schema's identifier and the SchemaError's message. Callers match
 * it via `Effect.catchTag`/`Result.isFailure`; they never receive a
 * silent `undefined` where a field should be.
 *
 * @since 0.1.0
 */
import type { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'
import * as Result from 'effect/Result'

/** A response body that failed to decode against its wire declaration. */
export class WireDecodeError extends S.TaggedError<WireDecodeError>()('WireDecodeError', {
  /** The declaration's identifier (`containerCreate`, `execInspect`, …). */
  schema: S.String,
  /** The underlying SchemaError or JSON-parse message. */
  message: S.String,
}) {}

/**
 * Decodes a daemon response body against a wire declaration.
 *
 * `identifier` names the declaration in the error so a decode failure tells
 * the caller exactly which payload was malformed. The result is a typed
 * success or a {@link WireDecodeError} — no default values are ever
 * manufactured.
 */
export const decodeJsonBody = <A, I>(
  schema: Wire.Minted<A, I>,
  identifier: string,
): (body: string) => Result.Result<A, WireDecodeError> => {
  const decode = S.decodeUnknownResult(schema)
  return (body) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return Result.fail(WireDecodeError.make({ schema: identifier, message: 'response body is not valid JSON' }))
    }
    const decoded = decode(parsed)
    if (Result.isFailure(decoded)) {
      return Result.fail(WireDecodeError.make({ schema: identifier, message: decoded.failure.message }))
    }
    return Result.succeed(decoded.success)
  }
}
