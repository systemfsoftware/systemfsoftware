import type { client } from '@systemfsoftware/alchemy-cloudflare'
import { Schema } from 'effect'

/** A raw value off the wire: what the edge answered before a case reads it. */
export const RawValue = Schema.Unknown
export type RawValue = typeof RawValue.Type

/**
 * The Cloudflare product families a captured answer can belong to. The record is
 * exhaustive over `client.CloudflareProductFamily`: a family added to the
 * client's vocabulary refuses to compile here until it is listed, so the
 * fixture's `product` never drifts from the derivation in
 * `@systemfsoftware/alchemy-cloudflare`.
 */
const PRODUCT_FAMILIES = {
  k2Streams: 'k2Streams',
  basinCatalog: 'basinCatalog',
  pipelinesSinks: 'pipelinesSinks',
  urlScanner: 'urlScanner',
  monetization: 'monetization',
  workersObservability: 'workersObservability',
  alerting: 'alerting',
  spectrum: 'spectrum',
  workersKv: 'workersKv',
  zoneTracing: 'zoneTracing',
  containers: 'containers',
  r2: 'r2',
  workersScripts: 'workersScripts',
  unknown: 'unknown',
} as const satisfies Record<client.CloudflareProductFamily, client.CloudflareProductFamily>

/** The HTTP methods the capture lane issues. */
export const CaptureMethod = Schema.Literals(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)
export type CaptureMethod = typeof CaptureMethod.Type

/** The product family a case belongs to. */
export const CaptureProduct = Schema.Literals(Object.values(PRODUCT_FAMILIES))
export type CaptureProduct = typeof CaptureProduct.Type

/**
 * One captured Cloudflare answer, the fixture's element. `endpoint` is the
 * generated client's path template with its `{placeholders}` intact: a concrete
 * path carries no placeholder, so the schema refuses it, and a captured account
 * id, zone id, or resource id can never be recorded. `capturedOn` is the UTC day
 * the answer was observed, `YYYY-MM-DD`.
 */
export const CapturedResponse = Schema.Struct({
  case: Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))),
  product: CaptureProduct,
  operation: Schema.String.pipe(Schema.check(Schema.isPattern(/\S/))),
  method: CaptureMethod,
  endpoint: Schema.String.pipe(
    Schema.check(Schema.isPattern(/^\/\S*$/), Schema.isPattern(/\{[a-z_][a-z0-9_]*\}/)),
  ),
  status: Schema.Int,
  code: Schema.Int,
  message: Schema.NonEmptyString,
  capturedOn: Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
})
export type CapturedResponse = typeof CapturedResponse.Type

/** The fixture file: an array of captured answers, ordered by `case` on write. */
export const CapturedResponses = Schema.Array(CapturedResponse)
export type CapturedResponses = typeof CapturedResponses.Type
