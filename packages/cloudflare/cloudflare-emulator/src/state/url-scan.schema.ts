import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const UrlScanOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/UrlScanOutcome')
type UrlScanOutcomeTypeId = typeof UrlScanOutcomeTypeId

export const UrlScanVisibility = Schema.Literals(['public', 'unlisted'])
export type UrlScanVisibility = typeof UrlScanVisibility.Type

export const UrlScanOptions = Schema.Struct({
  useragent: Schema.optional(Schema.String),
})
export type UrlScanOptions = typeof UrlScanOptions.Type

export const UrlScan = Schema.Struct({
  uuid: Schema.String,
  url: Schema.String,
  visibility: UrlScanVisibility,
  time: Schema.String,
  options: UrlScanOptions,
  agentReadiness: Schema.Boolean,
})
export type UrlScan = typeof UrlScan.Type

export const UrlScanState = Schema.Array(UrlScan)
export type UrlScanState = typeof UrlScanState.Type

export const emptyUrlScanState: UrlScanState = []

export class CreateScan extends Schema.TaggedClass<CreateScan>()('CreateScan', {
  account_id: Schema.String,
  url: Schema.String,
  visibility: Schema.optional(Schema.Literals(['Public', 'Unlisted'])),
  agentReadiness: Schema.optional(Schema.Boolean),
  customagent: Schema.optional(Schema.String),
}) {}

export class CreateScanWithoutBody extends Schema.TaggedClass<CreateScanWithoutBody>()('CreateScanWithoutBody', {}) {}

export class GetScan extends Schema.TaggedClass<GetScan>()('GetScan', {
  account_id: Schema.String,
  scan_id: Schema.String,
}) {}

export class SearchScans extends Schema.TaggedClass<SearchScans>()('SearchScans', {
  account_id: Schema.String,
  q: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Finite),
}) {}

export const UrlScanRequest = Schema.Union([CreateScan, CreateScanWithoutBody, GetScan, SearchScans])
export type UrlScanRequest = typeof UrlScanRequest.Type

export class UrlScanApplied extends Schema.TaggedClass<UrlScanApplied>()('UrlScanApplied', {
  state: UrlScanState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [UrlScanOutcomeTypeId] = UrlScanOutcomeTypeId
}

export class UrlScanRefused extends Schema.TaggedClass<UrlScanRefused>()('UrlScanRefused', {
  state: UrlScanState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [UrlScanOutcomeTypeId] = UrlScanOutcomeTypeId
}

export const UrlScanOutcome = Schema.Union([UrlScanApplied, UrlScanRefused])
export type UrlScanOutcome = typeof UrlScanOutcome.Type

export class UrlScanCommand extends Schema.TaggedClass<UrlScanCommand>()('UrlScanCommand', {
  now: Schema.String,
  newId: Schema.String,
  state: UrlScanState,
  request: UrlScanRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
