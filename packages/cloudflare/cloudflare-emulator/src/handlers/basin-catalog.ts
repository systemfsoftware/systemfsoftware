import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import { basinCatalog } from '../state/basin-catalog.workflow.js'
import {
  BasinCommand,
  DeleteCatalog,
  DisableCatalog,
  EnableCatalog,
  GetCatalogDetails,
  GetCredentialStatus,
  GetMaintenanceConfig,
  GetTable,
  GetTableMaintenanceConfig,
  ListCatalogs,
  ListNamespaces,
  ListTableMaintenanceRuns,
  ListTables,
  QueueTableMaintenance,
  StoreCredentials,
  UpdateMaintenanceConfig,
  UpdateTableMaintenanceConfig,
} from '../state/basin.schema.js'
import type { BasinRequest, BasinState } from '../state/basin.schema.js'
import type { EmulatorState } from '../state/emulator-state.js'

type BasinInput = { readonly now: string; readonly newId: string; readonly state: EmulatorState }

const runBasin = (input: BasinInput, request: BasinRequest): Settled<BasinState> => {
  const outcome = Result.getOrThrow(
    basinCatalog(BasinCommand.make({ now: input.now, newId: input.newId, state: input.state.basinCatalogs, request })),
  )
  return settledOf(outcome)
}

const applyBasin = (operation: string, isWrite: boolean, decide: (input: BasinInput) => Settled<BasinState>) =>
  settleOperation({
    slot: 'basinCatalogs',
    operation,
    isWrite,
    decide,
  })

export const basinCatalogManagementHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Basin Catalog Management',
  (handlers) =>
    handlers
      .handle(
        'basinListCatalogs',
        ({ params }) =>
          applyBasin('basinListCatalogs', false, (input) =>
            runBasin(input, ListCatalogs.make({ account_id: params.account_id }))),
      )
      .handle(
        'basinGetCatalogDetails',
        ({ params }) =>
          applyBasin('basinGetCatalogDetails', false, (input) =>
            runBasin(
              input,
              GetCatalogDetails.make({ account_id: params.account_id, bucket_name: params.bucket_name }),
            )),
      )
      .handle(
        'basinDeleteCatalog',
        ({ params }) =>
          applyBasin('basinDeleteCatalog', true, (input) =>
            runBasin(input, DeleteCatalog.make({ account_id: params.account_id, bucket_name: params.bucket_name }))),
      )
      .handle(
        'basinDisableCatalog',
        ({ params }) =>
          applyBasin('basinDisableCatalog', true, (input) =>
            runBasin(input, DisableCatalog.make({ account_id: params.account_id, bucket_name: params.bucket_name }))),
      )
      .handle('basinEnableCatalog', ({ params }) =>
        applyBasin('basinEnableCatalog', true, (input) =>
          runBasin(
            input,
            EnableCatalog.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              r2Buckets: input.state.r2Buckets,
            }),
          ))),
)

export const credentialManagementHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Credential Management',
  (handlers) =>
    handlers
      .handle('basinStoreCredentials', ({ params, payload }) =>
        applyBasin('basinStoreCredentials', true, (input) =>
          runBasin(
            input,
            StoreCredentials.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              token: payload.token,
            }),
          )))
      .handle('basinGetCredentialStatus', ({ params }) =>
        applyBasin('basinGetCredentialStatus', false, (input) =>
          runBasin(
            input,
            GetCredentialStatus.make({ account_id: params.account_id, bucket_name: params.bucket_name }),
          ))),
)

export const maintenanceConfigurationHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Maintenance Configuration',
  (handlers) =>
    handlers
      .handle('basinGetMaintenanceConfig', ({ params }) =>
        applyBasin('basinGetMaintenanceConfig', false, (input) =>
          runBasin(
            input,
            GetMaintenanceConfig.make({ account_id: params.account_id, bucket_name: params.bucket_name }),
          )))
      .handle('basinUpdateMaintenanceConfig', ({ params, payload }) =>
        applyBasin('basinUpdateMaintenanceConfig', true, (input) =>
          runBasin(
            input,
            UpdateMaintenanceConfig.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              compaction: payload.compaction,
              snapshot_expiration: payload.snapshot_expiration,
            }),
          ))),
)

export const namespaceManagementHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Namespace Management',
  (handlers) =>
    handlers.handle(
      'basinListNamespaces',
      ({ params }) =>
        applyBasin('basinListNamespaces', false, (input) =>
          runBasin(input, ListNamespaces.make({ account_id: params.account_id, bucket_name: params.bucket_name }))),
    ),
)

export const tableManagementHandlers = HttpApiBuilder.group(CloudflareApi, 'Table Management', (handlers) =>
  handlers
    .handle('basinListTables', ({ params }) =>
      applyBasin('basinListTables', false, (input) =>
        runBasin(
          input,
          ListTables.make({
            account_id: params.account_id,
            bucket_name: params.bucket_name,
            namespace: params.namespace,
          }),
        )))
    .handle('basinGetTable', ({ params }) =>
      applyBasin('basinGetTable', false, (input) =>
        runBasin(
          input,
          GetTable.make({
            account_id: params.account_id,
            bucket_name: params.bucket_name,
            namespace: params.namespace,
            table_name: params.table_name,
          }),
        ))))

export const tableMaintenanceConfigurationHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Table Maintenance Configuration',
  (handlers) =>
    handlers
      .handle('basinGetTableMaintenanceConfig', ({ params }) =>
        applyBasin('basinGetTableMaintenanceConfig', false, (input) =>
          runBasin(
            input,
            GetTableMaintenanceConfig.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              namespace: params.namespace,
              table_name: params.table_name,
            }),
          )))
      .handle('basinUpdateTableMaintenanceConfig', ({ params, payload }) =>
        applyBasin('basinUpdateTableMaintenanceConfig', true, (input) =>
          runBasin(
            input,
            UpdateTableMaintenanceConfig.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              namespace: params.namespace,
              table_name: params.table_name,
              compaction: payload.compaction,
              snapshot_expiration: payload.snapshot_expiration,
            }),
          )))
      .handle('basinQueueTableMaintenance', ({ params }) =>
        applyBasin('basinQueueTableMaintenance', true, (input) =>
          runBasin(
            input,
            QueueTableMaintenance.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              namespace: params.namespace,
              table_name: params.table_name,
              configuration_type: params.configuration_type,
            }),
          )))
      .handle('basinListTableMaintenanceRuns', ({ params }) =>
        applyBasin('basinListTableMaintenanceRuns', false, (input) =>
          runBasin(
            input,
            ListTableMaintenanceRuns.make({
              account_id: params.account_id,
              bucket_name: params.bucket_name,
              namespace: params.namespace,
              table_name: params.table_name,
            }),
          ))),
)
