import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  BasinApplied,
  BasinCatalog,
  BasinCommand,
  BasinCompaction,
  BasinCompactionUpdate,
  BasinMaintenance,
  BasinMaintenanceState,
  BasinOutcome,
  BasinRefused,
  BasinSnapshotExpiration,
  BasinSnapshotExpirationUpdate,
  BasinState,
  BasinTargetFileSize,
  DeleteCatalog,
  DisableCatalog,
  EnableCatalog,
  GetCatalogDetails,
  GetCredentialStatus,
  GetMaintenanceConfig,
  GetTable,
  GetTableMaintenanceConfig,
  ListNamespaces,
  ListTableMaintenanceRuns,
  ListTables,
  QueueTableMaintenance,
  StoreCredentials,
  UpdateMaintenanceConfig,
  UpdateTableMaintenanceConfig,
} from './basin.schema.js'
import type { R2BucketState } from './r2-bucket.schema.js'

const catalogNotFound = (state: BasinState): BasinRefused =>
  BasinRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'Catalog not found.' }) })

const bucketNotFound = (state: BasinState): BasinRefused =>
  BasinRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'R2 bucket not found.' }) })

const alreadyEnabled = (state: BasinState): BasinRefused =>
  BasinRefused.make({ state, status: 409, body: failureEnvelope({ code: 10004, message: 'Catalog already enabled.' }) })

const tableNotFound = (state: BasinState, tableName: string): BasinRefused =>
  BasinRefused.make({
    state,
    status: 404,
    body: failureEnvelope({ code: 10006, message: `Table ${tableName} not found.` }),
  })

const defaultMaintenance: BasinMaintenance = {
  compaction: { state: 'enabled', target_size_mb: '128' },
  snapshot_expiration: { state: 'enabled', min_snapshots_to_keep: 100, max_snapshot_age: '7d' },
}

const catalogName = (accountId: string, bucket: string): string => `${accountId}_${bucket}`

const findCatalog = (state: BasinState, bucket: string): Option.Option<BasinCatalog> =>
  Array.findFirst(state, (catalog) => catalog.bucket === bucket)

const bucketExists = (buckets: R2BucketState, name: string): boolean =>
  Array.contains(Array.map(buckets, (bucket) => bucket.name), name)

const replaceCatalog = (state: BasinState, bucket: string, updated: BasinCatalog): BasinState =>
  Array.map(state, (candidate) =>
    Match.value(candidate.bucket === bucket).pipe(
      Match.when(true, () => updated),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const setStatus = (state: BasinState, bucket: string, status: BasinCatalog['status']): BasinState =>
  Array.map(state, (candidate) =>
    Match.value(candidate.bucket === bucket).pipe(
      Match.when(true, (): BasinCatalog => ({ ...candidate, status })),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const activationBody = (catalog: BasinCatalog): Schema.Json => successEnvelope({ id: catalog.id, name: catalog.name })

const probeStatus = (status: BasinCatalog['credential_status']): string =>
  Match.value(status).pipe(
    Match.when('present', () => 'valid'),
    Match.when('absent', () => 'absent'),
    Match.exhaustive,
  )

const buildCatalog = (command: BasinCommand, request: EnableCatalog): BasinCatalog => ({
  bucket: request.bucket_name,
  credential_status: 'absent',
  id: command.newId,
  maintenance_config: defaultMaintenance,
  name: catalogName(request.account_id, request.bucket_name),
  status: 'active',
})

const listCatalogs = (command: BasinCommand): BasinOutcome =>
  BasinApplied.make({
    state: command.state,
    status: 200,
    body: successEnvelope({ warehouses: command.state }),
  })

const getCatalogDetails = (command: BasinCommand, request: GetCatalogDetails): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: (catalog) => BasinApplied.make({ state: command.state, status: 200, body: successEnvelope(catalog) }),
  })

const enableCatalog = (command: BasinCommand, request: EnableCatalog): BasinOutcome =>
  Match.value(bucketExists(request.r2Buckets, request.bucket_name)).pipe(
    Match.when(false, () => bucketNotFound(command.state)),
    Match.when(true, () =>
      Option.match(findCatalog(command.state, request.bucket_name), {
        onNone: () => {
          const catalog = buildCatalog(command, request)
          return BasinApplied.make({
            state: Array.append(command.state, catalog),
            status: 200,
            body: activationBody(catalog),
          })
        },
        onSome: (catalog) =>
          Match.value(catalog.status).pipe(
            Match.when('active', () => alreadyEnabled(command.state)),
            Match.when('inactive', () =>
              BasinApplied.make({
                state: setStatus(command.state, request.bucket_name, 'active'),
                status: 200,
                body: activationBody({ ...catalog, status: 'active' }),
              })),
            Match.exhaustive,
          ),
      })),
    Match.exhaustive,
  )

const disableCatalog = (command: BasinCommand, request: DisableCatalog): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: () =>
      BasinApplied.make({
        state: setStatus(command.state, request.bucket_name, 'inactive'),
        status: 204,
        body: successEnvelope({}),
      }),
  })

const deleteCatalog = (command: BasinCommand, request: DeleteCatalog): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: () =>
      BasinApplied.make({
        state: Array.filter(command.state, (catalog) => catalog.bucket !== request.bucket_name),
        status: 204,
        body: successEnvelope({}),
      }),
  })

const storeCredentials = (command: BasinCommand, request: StoreCredentials): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: (catalog) =>
      BasinApplied.make({
        state: replaceCatalog(command.state, catalog.bucket, { ...catalog, credential_status: 'present' }),
        status: 200,
        body: successEnvelope(null),
      }),
  })

const getCredentialStatus = (command: BasinCommand, request: GetCredentialStatus): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: (catalog) =>
      BasinApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope({ status: probeStatus(catalog.credential_status) }),
      }),
  })

const getMaintenanceConfig = (command: BasinCommand, request: GetMaintenanceConfig): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: (catalog) =>
      BasinApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope({
          credential_status: catalog.credential_status,
          maintenance_config: catalog.maintenance_config,
        }),
      }),
  })

const mergeCompaction = (current: BasinCompaction, update: BasinCompactionUpdate): BasinCompaction => ({
  state: Option.getOrElse(Option.fromUndefinedOr(update.state), (): BasinMaintenanceState => current.state),
  target_size_mb: Option.getOrElse(
    Option.fromUndefinedOr(update.target_size_mb),
    (): BasinTargetFileSize => current.target_size_mb,
  ),
})

const mergeSnapshotExpiration = (
  current: BasinSnapshotExpiration,
  update: BasinSnapshotExpirationUpdate,
): BasinSnapshotExpiration => ({
  state: Option.getOrElse(Option.fromUndefinedOr(update.state), (): BasinMaintenanceState => current.state),
  min_snapshots_to_keep: Option.getOrElse(
    Option.fromUndefinedOr(update.min_snapshots_to_keep),
    () => current.min_snapshots_to_keep,
  ),
  max_snapshot_age: Option.getOrElse(Option.fromUndefinedOr(update.max_snapshot_age), () => current.max_snapshot_age),
})

const mergeMaintenance = (current: BasinMaintenance, request: UpdateMaintenanceConfig): BasinMaintenance => ({
  compaction: mergeCompaction(
    current.compaction,
    Option.getOrElse(Option.fromUndefinedOr(request.compaction), (): BasinCompactionUpdate => ({})),
  ),
  snapshot_expiration: mergeSnapshotExpiration(
    current.snapshot_expiration,
    Option.getOrElse(Option.fromUndefinedOr(request.snapshot_expiration), (): BasinSnapshotExpirationUpdate => ({})),
  ),
})

const updateMaintenanceConfig = (command: BasinCommand, request: UpdateMaintenanceConfig): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: (catalog) => {
      const maintenance = mergeMaintenance(catalog.maintenance_config, request)
      return BasinApplied.make({
        state: replaceCatalog(command.state, catalog.bucket, { ...catalog, maintenance_config: maintenance }),
        status: 200,
        body: successEnvelope(maintenance),
      })
    },
  })

const listNamespaces = (command: BasinCommand, request: ListNamespaces): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: () =>
      BasinApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope({ namespaces: [], next_page_token: null }),
      }),
  })

const listTables = (command: BasinCommand, request: ListTables): BasinOutcome =>
  Option.match(findCatalog(command.state, request.bucket_name), {
    onNone: () => catalogNotFound(command.state),
    onSome: () =>
      BasinApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope({ identifiers: [], next_page_token: null }),
      }),
  })

const getTable = (command: BasinCommand, request: GetTable): BasinOutcome =>
  tableNotFound(command.state, request.table_name)

const getTableMaintenanceConfig = (command: BasinCommand, request: GetTableMaintenanceConfig): BasinOutcome =>
  tableNotFound(command.state, request.table_name)

const updateTableMaintenanceConfig = (command: BasinCommand, request: UpdateTableMaintenanceConfig): BasinOutcome =>
  tableNotFound(command.state, request.table_name)

const queueTableMaintenance = (command: BasinCommand, request: QueueTableMaintenance): BasinOutcome =>
  tableNotFound(command.state, request.table_name)

const listTableMaintenanceRuns = (command: BasinCommand, request: ListTableMaintenanceRuns): BasinOutcome =>
  tableNotFound(command.state, request.table_name)

const decide = (command: BasinCommand): Result.Result<BasinOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListCatalogs', () => listCatalogs(command)),
      Match.tag('GetCatalogDetails', (request) => getCatalogDetails(command, request)),
      Match.tag('EnableCatalog', (request) => enableCatalog(command, request)),
      Match.tag('DisableCatalog', (request) => disableCatalog(command, request)),
      Match.tag('DeleteCatalog', (request) => deleteCatalog(command, request)),
      Match.tag('StoreCredentials', (request) => storeCredentials(command, request)),
      Match.tag('GetCredentialStatus', (request) => getCredentialStatus(command, request)),
      Match.tag('GetMaintenanceConfig', (request) => getMaintenanceConfig(command, request)),
      Match.tag('UpdateMaintenanceConfig', (request) => updateMaintenanceConfig(command, request)),
      Match.tag('ListNamespaces', (request) => listNamespaces(command, request)),
      Match.tag('ListTables', (request) => listTables(command, request)),
      Match.tag('GetTable', (request) => getTable(command, request)),
      Match.tag('GetTableMaintenanceConfig', (request) => getTableMaintenanceConfig(command, request)),
      Match.tag('UpdateTableMaintenanceConfig', (request) => updateTableMaintenanceConfig(command, request)),
      Match.tag('QueueTableMaintenance', (request) => queueTableMaintenance(command, request)),
      Match.tag('ListTableMaintenanceRuns', (request) => listTableMaintenanceRuns(command, request)),
      Match.exhaustive,
    ),
  )

export const basinCatalog = Workflow.make({
  command: BasinCommand,
  decision: BasinOutcome,
  error: Schema.Never,
  decide,
})
