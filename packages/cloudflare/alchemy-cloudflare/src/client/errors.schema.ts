/**
 * The Cloudflare client error model's pure vocabulary: the response envelope,
 * the tagged errors it decodes into, the classification signal, and the
 * per-product tables that map Cloudflare's codes onto a variant.
 *
 * Cloudflare answers every client-v4 call with `{ success, errors, messages,
 * result, result_info }` (distilled `lib/protocol.js`, decoded in
 * `../cloudflare-api.ts`'s generated envelope schemas). A failure carries one
 * or more `{ code, message }` entries.
 *
 * A code has no meaning on its own: 1003 is a duplicate sink to Pipelines, a
 * missing namespace to Basin, and an invalid request to Workers Observability;
 * 10014 is a taken namespace title to Workers KV and an entitlement refusal to
 * Workers. Classification therefore reads (family, status, code): the family is
 * derived from the request path by {@link productFamily}, the HTTP status keeps
 * its meaning for 404 / 409 / 429, and only a code the family's table cites
 * refines the rest. A code absent from the family's table falls back to the
 * status class, so no product's vocabulary leaks into another's.
 *
 * Every table entry cites the source that fixes the code's meaning:
 * - `../../openapi/slice.json` — the operation's `x-cfLinkErrors` dictionary.
 * - `distilled.cloud-cloudflare` `lib/services/<service>.js` — an
 *   `applyErrorMatchers` code.
 * - Alchemy `src/Cloudflare/<Product>/*.ts` — a handler tag and code.
 * A code with no citation is dropped; it is not classified.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Arr from 'effect/Array'

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
  path: Schema.String,
  status: Schema.Finite,
  code: Schema.Finite,
  message: Schema.String,
  retryAfterSeconds: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export type CloudflareErrorKind =
  | 'NotFound'
  | 'AlreadyExists'
  | 'Validation'
  | 'RateLimited'
  | 'Entitlement'
  | 'Unknown'

export type CloudflareProductFamily =
  | 'k2Streams'
  | 'basinCatalog'
  | 'pipelinesSinks'
  | 'urlScanner'
  | 'monetization'
  | 'workersObservability'
  | 'alerting'
  | 'spectrum'
  | 'workersKv'
  | 'zoneTracing'
  | 'containers'
  | 'r2'
  | 'workersScripts'
  | 'unknown'

export const productFamily = (path: string): CloudflareProductFamily =>
  Match.value(path).pipe(
    Match.when((p) => p.includes('/workers/observability/'), () => 'workersObservability' as const),
    Match.when((p) => p.includes('/observability/tracing/'), () => 'zoneTracing' as const),
    Match.when((p) => p.includes('/storage/kv/'), () => 'workersKv' as const),
    Match.when((p) => p.includes('/alerting/'), () => 'alerting' as const),
    Match.when((p) => p.includes('/spectrum/'), () => 'spectrum' as const),
    Match.when((p) => p.includes('/urlscanner/'), () => 'urlScanner' as const),
    Match.when((p) => p.includes('/monetization'), () => 'monetization' as const),
    Match.when((p) => p.includes('/pipelines/'), () => 'pipelinesSinks' as const),
    Match.when((p) => p.includes('/basin-catalog'), () => 'basinCatalog' as const),
    Match.when((p) => p.includes('/k2/streams'), () => 'k2Streams' as const),
    Match.when((p) => p.includes('/containers/'), () => 'containers' as const),
    Match.when((p) => p.includes('/r2/'), () => 'r2' as const),
    Match.when((p) => p.includes('/workers/'), () => 'workersScripts' as const),
    Match.orElse(() => 'unknown' as const),
  )

interface CloudflareCodeEntry {
  readonly code: number
  readonly kind: CloudflareErrorKind
}

/**
 * (family, code) -> kind, each entry citing the source that fixes the code's
 * meaning in that family. A code a family does not cite falls back to status.
 */
const PRODUCT_CODE_TABLE: Readonly<Record<CloudflareProductFamily, ReadonlyArray<CloudflareCodeEntry>>> = {
  k2Streams: [],
  basinCatalog: [
    { code: 10006, kind: 'NotFound' }, // r2_data_catalog.js:43 NoSuchBucket
    { code: 10001, kind: 'NotFound' }, // r2_data_catalog.js:49 TableNotFound
  ],
  pipelinesSinks: [
    { code: 1003, kind: 'AlreadyExists' }, // pipelines.js:86 SinkAlreadyExists; :74 PipelineAlreadyExists; :110 StreamAlreadyExists
  ],
  urlScanner: [],
  monetization: [],
  workersObservability: [],
  alerting: [],
  spectrum: [
    { code: 10006, kind: 'NotFound' }, // spectrum.js:31 SpectrumAppNotFound
  ],
  workersKv: [
    { code: 10014, kind: 'AlreadyExists' }, // kv.js:64 NamespaceTitleAlreadyExists; :521 "A 400 is returned if the account already owns a namespace with this title."
    { code: 10013, kind: 'NotFound' }, // kv.js:58 NamespaceNotFound
  ],
  zoneTracing: [],
  containers: [
    { code: 1609, kind: 'NotFound' }, // containers.js:7 ContainerApplicationNotFound
  ],
  r2: [
    { code: 10006, kind: 'NotFound' }, // r2.js:110 NoSuchBucket
  ],
  // Workers (`/accounts/{account_id}/workers/...`): the /workers/scripts path is
  // outside this slice's allowlist (scripts/tools/repin-cloudflare-api.ts), so
  // the codes cite the pinned upstream contract — its
  // `workers_script-response-upload` `x-cfLinkErrors` dictionary (openapi/PIN,
  // cloudflare/api-schemas @8118833).
  workersScripts: [
    { code: 10015, kind: 'Entitlement' }, // upstream workers_script-response-upload: "The current account is not authorized to use workers"
    { code: 10075, kind: 'Entitlement' }, // upstream workers_script-response-upload: "Requires a Workers Paid plan"
    { code: 10007, kind: 'NotFound' }, // upstream workers_script-response-upload: "Resource not found (similar to HTTP 404)"
  ],
  unknown: [],
}

const VALIDATION_STATUSES: ReadonlyArray<number> = [400, 422]
const ENTITLEMENT_MESSAGE = /not entitled to use/i

const codeKind = (signal: CloudflareErrorSignal): Option.Option<CloudflareErrorKind> =>
  Arr.findFirst(
    PRODUCT_CODE_TABLE[productFamily(signal.path)],
    (entry) => entry.code === signal.code,
  ).pipe(Option.map((entry) => entry.kind))

const isEntitlementRefusal = (signal: CloudflareErrorSignal): boolean =>
  Match.value(signal.status).pipe(
    Match.when(403, () => ENTITLEMENT_MESSAGE.test(signal.message)),
    Match.orElse(() => false),
  )

export const cloudflareErrorKind = (signal: CloudflareErrorSignal): CloudflareErrorKind =>
  Match.value(signal).pipe(
    Match.when((s) => s.status === 404, () => 'NotFound' as const),
    Match.when((s) => s.status === 409, () => 'AlreadyExists' as const),
    Match.when((s) => s.status === 429, () => 'RateLimited' as const),
    Match.when((s) => Option.isSome(codeKind(s)), (s) => Option.getOrThrow(codeKind(s))),
    Match.when((s) => VALIDATION_STATUSES.includes(s.status), () => 'Validation' as const),
    Match.when(isEntitlementRefusal, () => 'Entitlement' as const),
    Match.orElse(() => 'Unknown' as const),
  )
