import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import { R2BucketState } from './r2-bucket.schema.js'

const BasinOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/BasinOutcome')
type BasinOutcomeTypeId = typeof BasinOutcomeTypeId

export const BasinCatalogStatus = Schema.Literals(['active', 'inactive'])
export type BasinCatalogStatus = typeof BasinCatalogStatus.Type

export const BasinCredentialStatus = Schema.Literals(['present', 'absent'])
export type BasinCredentialStatus = typeof BasinCredentialStatus.Type

export const BasinProbeStatus = Schema.Literals(['valid', 'invalid', 'absent'])
export type BasinProbeStatus = typeof BasinProbeStatus.Type

export const BasinMaintenanceState = Schema.Literals(['enabled', 'disabled'])
export type BasinMaintenanceState = typeof BasinMaintenanceState.Type

export const BasinTargetFileSize = Schema.Literals(['64', '128', '256', '512'])
export type BasinTargetFileSize = typeof BasinTargetFileSize.Type

export const BasinCompaction = Schema.Struct({
  state: BasinMaintenanceState,
  target_size_mb: BasinTargetFileSize,
})
export type BasinCompaction = typeof BasinCompaction.Type

export const BasinSnapshotExpiration = Schema.Struct({
  state: BasinMaintenanceState,
  min_snapshots_to_keep: Schema.Finite,
  max_snapshot_age: Schema.String,
})
export type BasinSnapshotExpiration = typeof BasinSnapshotExpiration.Type

export const BasinMaintenance = Schema.Struct({
  compaction: BasinCompaction,
  snapshot_expiration: BasinSnapshotExpiration,
})
export type BasinMaintenance = typeof BasinMaintenance.Type

export const BasinCompactionUpdate = Schema.Struct({
  state: Schema.optional(BasinMaintenanceState),
  target_size_mb: Schema.optional(BasinTargetFileSize),
})
export type BasinCompactionUpdate = typeof BasinCompactionUpdate.Type

export const BasinSnapshotExpirationUpdate = Schema.Struct({
  state: Schema.optional(BasinMaintenanceState),
  min_snapshots_to_keep: Schema.optional(Schema.Finite),
  max_snapshot_age: Schema.optional(Schema.String),
})
export type BasinSnapshotExpirationUpdate = typeof BasinSnapshotExpirationUpdate.Type

export const BasinCatalog = Schema.Struct({
  bucket: Schema.String,
  credential_status: BasinCredentialStatus,
  id: Schema.String,
  maintenance_config: BasinMaintenance,
  name: Schema.String,
  status: BasinCatalogStatus,
})
export type BasinCatalog = typeof BasinCatalog.Type

export const BasinState = Schema.Array(BasinCatalog)
export type BasinState = typeof BasinState.Type

export const emptyBasinState: BasinState = []

export class ListCatalogs extends Schema.TaggedClass<ListCatalogs>()('ListCatalogs', {
  account_id: Schema.String,
}) {}

export class GetCatalogDetails extends Schema.TaggedClass<GetCatalogDetails>()('GetCatalogDetails', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class EnableCatalog extends Schema.TaggedClass<EnableCatalog>()('EnableCatalog', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  r2Buckets: R2BucketState,
}) {}

export class DisableCatalog extends Schema.TaggedClass<DisableCatalog>()('DisableCatalog', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class DeleteCatalog extends Schema.TaggedClass<DeleteCatalog>()('DeleteCatalog', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class StoreCredentials extends Schema.TaggedClass<StoreCredentials>()('StoreCredentials', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  token: Schema.String,
}) {}

export class GetCredentialStatus extends Schema.TaggedClass<GetCredentialStatus>()('GetCredentialStatus', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class GetMaintenanceConfig extends Schema.TaggedClass<GetMaintenanceConfig>()('GetMaintenanceConfig', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class UpdateMaintenanceConfig extends Schema.TaggedClass<UpdateMaintenanceConfig>()('UpdateMaintenanceConfig', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  compaction: Schema.optional(BasinCompactionUpdate),
  snapshot_expiration: Schema.optional(BasinSnapshotExpirationUpdate),
}) {}

export class ListNamespaces extends Schema.TaggedClass<ListNamespaces>()('ListNamespaces', {
  account_id: Schema.String,
  bucket_name: Schema.String,
}) {}

export class ListTables extends Schema.TaggedClass<ListTables>()('ListTables', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
}) {}

export class GetTable extends Schema.TaggedClass<GetTable>()('GetTable', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
  table_name: Schema.String,
}) {}

export class GetTableMaintenanceConfig extends Schema.TaggedClass<GetTableMaintenanceConfig>()('GetTableMaintenanceConfig', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
  table_name: Schema.String,
}) {}

export class UpdateTableMaintenanceConfig extends Schema.TaggedClass<UpdateTableMaintenanceConfig>()('UpdateTableMaintenanceConfig', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
  table_name: Schema.String,
  compaction: Schema.optional(BasinCompactionUpdate),
  snapshot_expiration: Schema.optional(BasinSnapshotExpirationUpdate),
}) {}

export class QueueTableMaintenance extends Schema.TaggedClass<QueueTableMaintenance>()('QueueTableMaintenance', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
  table_name: Schema.String,
  configuration_type: Schema.String,
}) {}

export class ListTableMaintenanceRuns extends Schema.TaggedClass<ListTableMaintenanceRuns>()('ListTableMaintenanceRuns', {
  account_id: Schema.String,
  bucket_name: Schema.String,
  namespace: Schema.String,
  table_name: Schema.String,
}) {}

export const BasinRequest = Schema.Union([
  ListCatalogs,
  GetCatalogDetails,
  EnableCatalog,
  DisableCatalog,
  DeleteCatalog,
  StoreCredentials,
  GetCredentialStatus,
  GetMaintenanceConfig,
  UpdateMaintenanceConfig,
  ListNamespaces,
  ListTables,
  GetTable,
  GetTableMaintenanceConfig,
  UpdateTableMaintenanceConfig,
  QueueTableMaintenance,
  ListTableMaintenanceRuns,
])
export type BasinRequest = typeof BasinRequest.Type

export class BasinApplied extends Schema.TaggedClass<BasinApplied>()('BasinApplied', {
  state: BasinState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [BasinOutcomeTypeId] = BasinOutcomeTypeId
}

export class BasinRefused extends Schema.TaggedClass<BasinRefused>()('BasinRefused', {
  state: BasinState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [BasinOutcomeTypeId] = BasinOutcomeTypeId
}

export const BasinOutcome = Schema.Union([BasinApplied, BasinRefused])
export type BasinOutcome = typeof BasinOutcome.Type

export class BasinCommand extends Schema.TaggedClass<BasinCommand>()('BasinCommand', {
  now: Schema.String,
  newId: Schema.String,
  state: BasinState,
  request: BasinRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
