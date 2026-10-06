/**
 * The Cloudflare client error model's pure vocabulary: the response envelope,
 * the tagged errors it decodes into, the classification signal, and the data
 * table that maps Cloudflare's codes onto a variant.
 *
 * Cloudflare answers every client-v4 call with `{ success, errors, messages,
 * result, result_info }` (distilled `lib/protocol.js`, decoded in
 * `../cloudflare-api.ts`'s generated envelope schemas). A failure carries one
 * or more `{ code, message }` entries; classification keys on the HTTP status
 * first, then the code, then the message.
 *
 * Citations for the code tables:
 * - 409 `"Namespace already exists."` and 400 `"Invalid input."` /
 *   `"Bad request …"` — the committed slice `../../openapi/slice.json` (Basin
 *   catalog, pipeline sinks, urlscanner).
 * - `1003` — `cloudflare/api-schemas` @8118833 `openapi.json` uses it both as
 *   the `code` field's example and, for Basin, as `{ "code": 1003, "message":
 *   "namespace not found" }`; the task brief cites the pipelines duplicate-name
 *   case as `1003`. It is therefore a product-specific entry a resource unit
 *   extends, not a global law.
 * - `10014` / `10015` / `10042` — Cloudflare Workers and R2 entitlement codes
 *   (`workers.api.error.entitlement`, `workers.api.error.not_entitled`, R2
 *   `NotEntitled`); the abuse-reports schema documents entitlement as the
 *   message `"Not entitled to use feature: …"` (`openapi.json` @8118833).
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'

/** One entry of the envelope's `errors` array. */
export const CloudflareEnvelopeError = Schema.Struct({
  code: Schema.optionalKey(Schema.Finite),
  message: Schema.optionalKey(Schema.String),
})

/** Cloudflare's client-v4 response envelope. */
export const CloudflareEnvelope = Schema.Struct({
  success: Schema.optionalKey(Schema.Boolean),
  errors: Schema.optionalKey(Schema.Array(CloudflareEnvelopeError)),
  messages: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  result: Schema.optionalKey(Schema.Unknown),
  result_info: Schema.optionalKey(Schema.Unknown),
})

export type CloudflareEnvelope = typeof CloudflareEnvelope.Type

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  code: Schema.Finite,
  message: Schema.String,
}) {}

export class AlreadyExists extends Schema.TaggedError<AlreadyExists>()('AlreadyExists', {
  code: Schema.Finite,
  message: Schema.String,
}) {}

export class Validation extends Schema.TaggedError<Validation>()('Validation', {
  code: Schema.Finite,
  message: Schema.String,
}) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()('RateLimited', {
  code: Schema.Finite,
  message: Schema.String,
  retryAfter: Schema.Duration,
}) {}

export class Entitlement extends Schema.TaggedError<Entitlement>()('Entitlement', {
  code: Schema.Finite,
  message: Schema.String,
}) {}

export class CloudflareApiError extends Schema.TaggedError<CloudflareApiError>()('CloudflareApiError', {
  status: Schema.Finite,
  code: Schema.Finite,
  message: Schema.String,
}) {}

export const CloudflareError = Schema.Union([
  NotFound,
  AlreadyExists,
  Validation,
  RateLimited,
  Entitlement,
  CloudflareApiError,
])

export type CloudflareError = typeof CloudflareError.Type

export class CloudflareErrorSignal extends Schema.TaggedClass<CloudflareErrorSignal>()('CloudflareErrorSignal', {
  status: Schema.Finite,
  code: Schema.Finite,
  message: Schema.String,
  retryAfterSeconds: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

/** The classification outcome; a resource unit extends the tables below. */
export type CloudflareErrorKind =
  | 'NotFound'
  | 'AlreadyExists'
  | 'Validation'
  | 'RateLimited'
  | 'Entitlement'
  | 'Unknown'

// Product-specific codes, keyed to the variant they classify as. Extend here.
const ALREADY_EXISTS_CODES: ReadonlyArray<number> = [
  1003, // pipelines sink duplicate name; Basin also uses 1003 for "namespace not found"
]
const ENTITLEMENT_CODES: ReadonlyArray<number> = [10014, 10015, 10042]
const VALIDATION_STATUSES: ReadonlyArray<number> = [400, 422]
const ENTITLEMENT_MESSAGE = /not entitled to use/i

/** The decision's discriminant, single path over the signal. */
export const cloudflareErrorKind = (signal: CloudflareErrorSignal): CloudflareErrorKind =>
  Match.value(signal).pipe(
    Match.when((s) => s.status === 404, () => 'NotFound' as const),
    Match.when((s) => s.status === 409, () => 'AlreadyExists' as const),
    Match.when((s) => s.status === 429, () => 'RateLimited' as const),
    Match.when((s) => ALREADY_EXISTS_CODES.includes(s.code), () => 'AlreadyExists' as const),
    Match.when((s) => ENTITLEMENT_CODES.includes(s.code), () => 'Entitlement' as const),
    Match.when((s) => VALIDATION_STATUSES.includes(s.status), () => 'Validation' as const),
    Match.when((s) => ENTITLEMENT_MESSAGE.test(s.message), () => 'Entitlement' as const),
    Match.orElse(() => 'Unknown' as const),
  )
