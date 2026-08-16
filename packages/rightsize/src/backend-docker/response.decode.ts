/**
 * Effect-returning decode for daemon response bodies — the adapter-side half
 * of the loud-decode contract in `wire/decode.ts`.
 *
 * `decodeJsonBody` yields a `Result` (pure); the adapters travel on an
 * Effect error channel carrying only {@link BackendError}, so this maps a
 * {@link WireDecodeError} into a `BackendError` that names the declaring
 * schema and the schema error. Decoding never falls back to a default —
 * a body that violates its wire declaration fails loudly (KTD8).
 *
 * One deliberate exception: the list endpoints (`GET /containers/json`,
 * `GET /networks`) are probed tolerantly — a decode failure reads as "no
 * ids" — matching upstream's drift-tolerant list posture; every other
 * payload goes through this loud path.
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Effect, Option } from 'effect'
import * as Result from 'effect/Result'
import { BackendError } from '../model/errors.js'
import { CollectionEntry } from './wire/collection.schema.js'
import { decodeJsonBody } from './wire/decode.js'

/** Decodes one daemon response body against a wire declaration; any failure is a loud {@link BackendError}. */
export const decodeResponseBody = <A, I>(
  schema: Wire.Minted<A, I>,
  identifier: string,
): (body: string) => Effect.Effect<A, BackendError> => {
  const decode = decodeJsonBody(schema, identifier)
  return (body: string) => {
    const result = decode(body)
    if (Result.isFailure(result)) {
      return Effect.fail(
        BackendError.make({
          message: `docker response for '${identifier}' failed to decode: ${result.failure.message}`,
        }),
      )
    }
    return Effect.succeed(result.success)
  }
}

/**
 * Decodes a daemon list body (`GET /containers/json`, `GET /networks`) into
 * its `Id` members — the one tolerant decode in this backend. Returns `[]`
 * on any failure (daemon drift, malformed body), which every caller treats
 * as "not found"; the daemon's list payloads are the one surface upstream
 * deliberately reads with drift tolerance.
 */
export const decodeCollectionIds = (body: string): Effect.Effect<readonly string[], never> =>
  Effect.gen(function*() {
    const decoded = yield* decodeResponseBody(Wire.array(CollectionEntry), 'collectionList')(body).pipe(Effect.option)
    if (Option.isNone(decoded)) {
      return []
    }
    return decoded.value.map((entry) => entry.Id)
  })
