import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const SpectrumOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/SpectrumOutcome')
type SpectrumOutcomeTypeId = typeof SpectrumOutcomeTypeId

export const SpectrumTrafficType = Schema.Literals(['direct', 'http', 'https', 'worker'])
export type SpectrumTrafficType = typeof SpectrumTrafficType.Type

export const SpectrumTls = Schema.Literals(['off', 'flexible', 'full', 'strict'])
export type SpectrumTls = typeof SpectrumTls.Type

export const SpectrumProxyProtocol = Schema.Literals(['off', 'v1', 'v2', 'simple'])
export type SpectrumProxyProtocol = typeof SpectrumProxyProtocol.Type

export const SpectrumDns = Schema.Struct({
  name: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Literals(['CNAME', 'ADDRESS'])),
})
export type SpectrumDns = typeof SpectrumDns.Type

export const SpectrumEdgeIps = Schema.Struct({
  connectivity: Schema.optional(Schema.Literals(['all', 'ipv4', 'ipv6'])),
  ips: Schema.optional(Schema.Array(Schema.String)),
  type: Schema.optional(Schema.Literals(['dynamic', 'static'])),
})
export type SpectrumEdgeIps = typeof SpectrumEdgeIps.Type

export const SpectrumOriginDns = Schema.Struct({
  name: Schema.optional(Schema.String),
  ttl: Schema.optional(Schema.Finite),
  type: Schema.optional(Schema.Literals(['', 'A', 'AAAA', 'SRV'])),
})
export type SpectrumOriginDns = typeof SpectrumOriginDns.Type

const OriginPort = Schema.Union([Schema.Finite, Schema.String])
export type OriginPort = typeof OriginPort.Type

export const SpectrumApplication = Schema.Struct({
  argo_smart_routing: Schema.Boolean,
  created_on: Schema.String,
  dns: SpectrumDns,
  edge_ips: SpectrumEdgeIps,
  id: Schema.String,
  ip_firewall: Schema.Boolean,
  modified_on: Schema.String,
  origin_direct: Schema.optional(Schema.Array(Schema.String)),
  origin_dns: Schema.optional(SpectrumOriginDns),
  origin_port: Schema.optional(OriginPort),
  origin_worker_id: Schema.optional(Schema.String),
  protocol: Schema.String,
  proxy_protocol: SpectrumProxyProtocol,
  tls: SpectrumTls,
  traffic_type: SpectrumTrafficType,
  virtual_network_id: Schema.optional(Schema.String),
})
export type SpectrumApplication = typeof SpectrumApplication.Type

export const SpectrumApplicationInput = Schema.Struct({
  argo_smart_routing: Schema.optional(Schema.Boolean),
  created_on: Schema.optional(Schema.String),
  dns: SpectrumDns,
  edge_ips: Schema.optional(SpectrumEdgeIps),
  id: Schema.optional(Schema.String),
  ip_firewall: Schema.optional(Schema.Boolean),
  modified_on: Schema.optional(Schema.String),
  origin_direct: Schema.optional(Schema.Array(Schema.String)),
  origin_dns: Schema.optional(SpectrumOriginDns),
  origin_port: Schema.optional(OriginPort),
  origin_worker_id: Schema.optional(Schema.String),
  protocol: Schema.String,
  proxy_protocol: Schema.optional(SpectrumProxyProtocol),
  tls: Schema.optional(SpectrumTls),
  traffic_type: Schema.optional(SpectrumTrafficType),
  virtual_network_id: Schema.optional(Schema.String),
})
export type SpectrumApplicationInput = typeof SpectrumApplicationInput.Type

export const StoredSpectrumApplication = Schema.Struct({
  app: SpectrumApplication,
  zone_id: Schema.String,
})
export type StoredSpectrumApplication = typeof StoredSpectrumApplication.Type

export const SpectrumAppState = Schema.Array(StoredSpectrumApplication)
export type SpectrumAppState = typeof SpectrumAppState.Type

export const emptySpectrumAppState: SpectrumAppState = []

export const AWS_EDGE_IPS_DEFAULT: SpectrumEdgeIps = { connectivity: 'all', type: 'dynamic' }
export const TLS_DEFAULT: SpectrumTls = 'off'
export const PROXY_PROTOCOL_DEFAULT: SpectrumProxyProtocol = 'off'
export const TRAFFIC_TYPE_DEFAULT: SpectrumTrafficType = 'direct'

export class ListSpectrumApps extends Schema.TaggedClass<ListSpectrumApps>()('ListSpectrumApps', {
  page: Schema.optional(Schema.Finite),
  per_page: Schema.optional(Schema.Finite),
  zone_id: Schema.String,
}) {}

export class CreateSpectrumApp extends Schema.TaggedClass<CreateSpectrumApp>()('CreateSpectrumApp', {
  body: Schema.Json,
  zone_id: Schema.String,
}) {}

export class GetSpectrumApp extends Schema.TaggedClass<GetSpectrumApp>()('GetSpectrumApp', {
  app_id: Schema.String,
  zone_id: Schema.String,
}) {}

export class ReplaceSpectrumApp extends Schema.TaggedClass<ReplaceSpectrumApp>()('ReplaceSpectrumApp', {
  app_id: Schema.String,
  body: Schema.Json,
  zone_id: Schema.String,
}) {}

export class DeleteSpectrumApp extends Schema.TaggedClass<DeleteSpectrumApp>()('DeleteSpectrumApp', {
  app_id: Schema.String,
  zone_id: Schema.String,
}) {}

export const SpectrumRequest = Schema.Union([
  ListSpectrumApps,
  CreateSpectrumApp,
  GetSpectrumApp,
  ReplaceSpectrumApp,
  DeleteSpectrumApp,
])
export type SpectrumRequest = typeof SpectrumRequest.Type

export class SpectrumApplied extends Schema.TaggedClass<SpectrumApplied>()('SpectrumApplied', {
  body: Schema.Json,
  state: SpectrumAppState,
  status: Schema.Finite,
}) {
  readonly [SpectrumOutcomeTypeId] = SpectrumOutcomeTypeId
}

export class SpectrumRefused extends Schema.TaggedClass<SpectrumRefused>()('SpectrumRefused', {
  body: Schema.Json,
  state: SpectrumAppState,
  status: Schema.Finite,
}) {
  readonly [SpectrumOutcomeTypeId] = SpectrumOutcomeTypeId
}

export const SpectrumOutcome = Schema.Union([SpectrumApplied, SpectrumRefused])
export type SpectrumOutcome = typeof SpectrumOutcome.Type

export class SpectrumCommand extends Schema.TaggedClass<SpectrumCommand>()('SpectrumCommand', {
  newId: Schema.String,
  now: Schema.String,
  request: SpectrumRequest,
  state: SpectrumAppState,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
