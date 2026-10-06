import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const BUCKET = 'basin-catalog-test'
const OTHER_BUCKET = 'basin-catalog-other'
const NEVER_ENABLED = 'never-enabled'
const NAMESPACE = 'sales'
const TABLE = 'orders'
const TABLE_UUID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const LOCATION = 's3://basin-catalog-test/sales/orders/metadata/00000.metadata.json'

// Hand-written Iceberg metadata, never computed by the emulator under test.
const METADATA = { format_version: 2, 'table-uuid': TABLE_UUID, location: LOCATION } as const

// Hand-written from slice.json r2-data-catalog_table-maintenance-config: the default
// the catalog was enabled with, then the config seeded onto the table.
const DEFAULT_MAINTENANCE = {
  compaction: { state: 'enabled', target_size_mb: '128' },
  snapshot_expiration: { state: 'enabled', min_snapshots_to_keep: 100, max_snapshot_age: '7d' },
} as const
const TABLE_MAINTENANCE = {
  compaction: { state: 'disabled', target_size_mb: '256' },
  snapshot_expiration: { state: 'enabled', min_snapshots_to_keep: 10, max_snapshot_age: '30d' },
} as const

// Hand-written from slice.json r2-data-catalog_maintenance-run-record (required fields).
const RUN = {
  configuration_type: 'compaction',
  operation_results: [{ duration_ms: 42, operation: 'compaction', status: 'succeeded' }],
  run_id: 7,
  started_at: '2026-01-01T00:00:00.000Z',
  status: 'succeeded',
} as const

const TABLE_SEED = {
  maintenance_config: TABLE_MAINTENANCE,
  maintenance_runs: [RUN],
  metadata: METADATA,
  metadata_location: LOCATION,
  name: TABLE,
  namespace: [NAMESPACE],
  returned_snapshots: 1,
  table_uuid: TABLE_UUID,
  total_snapshots: 1,
}

// A staged table with no committed metadata file: slice.json basin-get-table says
// metadata_location is omitted for staged tables.
const STAGED_UUID = '33333333-3333-4333-8333-333333333333'
const STAGED_TABLE_SEED = {
  maintenance_config: TABLE_MAINTENANCE,
  maintenance_runs: [],
  metadata: METADATA,
  name: 'staging',
  namespace: [NAMESPACE],
  returned_snapshots: 0,
  table_uuid: STAGED_UUID,
  total_snapshots: 0,
}

// Message text is hand-written; slice.json basin-queue-table-maintenance defines no message.
const QUEUED_MESSAGE = 'Maintenance queued for normal polling.'

const accountParams = { account_id: ACCOUNT }
const bucketParams = (bucket_name: string) => ({ account_id: ACCOUNT, bucket_name })

type Refusal = {
  readonly kind: string
  readonly code: number
  readonly message: string
  readonly retryAfter: number | null
}

const shape = (kind: string, code: number, message: string): Refusal => ({ kind, code, message, retryAfter: null })

const observedError = <E>(error: E): Refusal => {
  if (Schema.is(cloudflare.NotFound)(error)) return shape('NotFound', error.code, error.message)
  if (Schema.is(cloudflare.AlreadyExists)(error)) return shape('AlreadyExists', error.code, error.message)
  if (Schema.is(cloudflare.Validation)(error)) return shape('Validation', error.code, error.message)
  if (Schema.is(cloudflare.Entitlement)(error)) return shape('Entitlement', error.code, error.message)
  if (Schema.is(cloudflare.RateLimited)(error)) {
    return { ...shape('RateLimited', error.code, error.message), retryAfter: Duration.toSeconds(error.retryAfter) }
  }
  if (Schema.is(cloudflare.CloudflareApiError)(error)) return shape('CloudflareApiError', error.code, error.message)
  if (Schema.is(Schema.instanceOf(Schema.SchemaError))(error)) return shape('SchemaError', 0, error.message)
  return shape('Unclassified', 0, 'The call failed outside the Cloudflare envelope.')
}

const observed = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<Refusal, never, R> =>
  effect.pipe(
    Effect.result,
    Effect.map(Result.match({
      onFailure: (error: E) => observedError(error),
      onSuccess: (): Refusal => ({ kind: 'Ok', code: 0, message: '', retryAfter: null }),
    })),
  )

const r2Buckets = Effect.map(cloudflare.CloudflareClient, (api) => api['R2 Bucket'])
const catalogs = Effect.map(cloudflare.CloudflareClient, (api) => api['Basin Catalog Management'])
const credentialManagement = Effect.map(cloudflare.CloudflareClient, (api) => api['Credential Management'])
const catalogMaintenance = Effect.map(cloudflare.CloudflareClient, (api) => api['Maintenance Configuration'])
const namespaceManagement = Effect.map(cloudflare.CloudflareClient, (api) => api['Namespace Management'])
const tableManagement = Effect.map(cloudflare.CloudflareClient, (api) => api['Table Management'])
const tableMaintenance = Effect.map(cloudflare.CloudflareClient, (api) => api['Table Maintenance Configuration'])

const createBucket = (name: string) =>
  Effect.flatMap(r2Buckets, (group) => group.r2CreateBucket({ headers: {}, params: accountParams, payload: { name } }))

const enableCatalog = (bucket_name: string) =>
  Effect.flatMap(catalogs, (group) => group.basinEnableCatalog({ params: bucketParams(bucket_name) }))

const catalogDetails = (bucket_name: string) =>
  Effect.flatMap(catalogs, (group) => group.basinGetCatalogDetails({ params: bucketParams(bucket_name) }))

const listCatalogs = () => Effect.flatMap(catalogs, (group) => group.basinListCatalogs({ params: accountParams }))

const disableCatalog = (bucket_name: string) =>
  Effect.flatMap(catalogs, (group) => group.basinDisableCatalog({ params: bucketParams(bucket_name) }))

const deleteCatalog = (bucket_name: string) =>
  Effect.flatMap(
    catalogs,
    (group) => group.basinDeleteCatalog({ params: bucketParams(bucket_name), query: { force: true } }),
  )

const storeCredential = (bucket_name: string, token: string) =>
  Effect.flatMap(
    credentialManagement,
    (group) => group.basinStoreCredentials({ params: bucketParams(bucket_name), payload: { token } }),
  )

const credentialStatus = (bucket_name: string) =>
  Effect.flatMap(credentialManagement, (group) => group.basinGetCredentialStatus({ params: bucketParams(bucket_name) }))

const getCatalogMaintenance = (bucket_name: string) =>
  Effect.flatMap(catalogMaintenance, (group) => group.basinGetMaintenanceConfig({ params: bucketParams(bucket_name) }))

const updateCatalogMaintenance = (bucket_name: string) =>
  Effect.flatMap(catalogMaintenance, (group) =>
    group.basinUpdateMaintenanceConfig({
      params: bucketParams(bucket_name),
      payload: {
        compaction: { state: 'disabled', target_size_mb: '512' },
        snapshot_expiration: { min_snapshots_to_keep: 5 },
      },
    }))

const listNamespaces = (bucket_name: string) =>
  Effect.flatMap(
    namespaceManagement,
    (group) => group.basinListNamespaces({ params: bucketParams(bucket_name), query: {} }),
  )

const listTables = (bucket_name: string, namespace: string) =>
  Effect.flatMap(
    tableManagement,
    (group) => group.basinListTables({ params: { account_id: ACCOUNT, bucket_name, namespace }, query: {} }),
  )

const getTable = (bucket_name: string, namespace: string, table_name: string) =>
  Effect.flatMap(
    tableManagement,
    (group) => group.basinGetTable({ params: { account_id: ACCOUNT, bucket_name, namespace, table_name } }),
  )

const getTableMaintenance = (bucket_name: string, namespace: string, table_name: string) =>
  Effect.flatMap(
    tableMaintenance,
    (group) =>
      group.basinGetTableMaintenanceConfig({ params: { account_id: ACCOUNT, bucket_name, namespace, table_name } }),
  )

const updateTableMaintenance = (bucket_name: string, namespace: string, table_name: string) =>
  Effect.flatMap(tableMaintenance, (group) =>
    group.basinUpdateTableMaintenanceConfig({
      params: { account_id: ACCOUNT, bucket_name, namespace, table_name },
      payload: { compaction: { target_size_mb: '512' }, snapshot_expiration: { max_snapshot_age: '1d' } },
    }))

const queueTableMaintenance = (bucket_name: string, namespace: string, table_name: string, request_id?: string) =>
  Effect.flatMap(tableMaintenance, (group) =>
    group.basinQueueTableMaintenance({
      params: { account_id: ACCOUNT, bucket_name, namespace, table_name, configuration_type: 'compaction' },
      payload: request_id === undefined ? {} : { request_id },
    }))

const listTableRuns = (bucket_name: string, namespace: string, table_name: string) =>
  Effect.flatMap(tableMaintenance, (group) =>
    group.basinListTableMaintenanceRuns({
      params: { account_id: ACCOUNT, bucket_name, namespace, table_name },
      query: {},
    }))

const seedTable = Effect.flatMap(
  Emulator,
  (emulator) => emulator.admin.seedCatalogTable({ bucket_name: BUCKET, table: TABLE_SEED }),
)

const seedStagedTable = Effect.flatMap(
  Emulator,
  (emulator) => emulator.admin.seedCatalogTable({ bucket_name: BUCKET, table: STAGED_TABLE_SEED }),
)

const withCatalog = (bucket_name: string) =>
  Effect.gen(function*() {
    yield* createBucket(bucket_name)
    yield* enableCatalog(bucket_name)
    return ACCOUNT
  })

const withSeededTable = Effect.gen(function*() {
  yield* withCatalog(BUCKET)
  yield* seedTable
  return ACCOUNT
})

const emulatorCredentials = Layer.effect(
  Credentials,
  Effect.map(
    Emulator,
    (emulator) => Effect.succeed(apiTokenCredentials({ apiToken: 'emulator', apiBaseUrl: emulator.baseUrl })),
  ),
)

const clientOnEmulator = Layer.mergeAll(
  cloudflare.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  emulatorCredentials,
).pipe(Layer.provideMerge(emulatorLayer), Layer.provideMerge(NodeServices.layer), Layer.orDie)

Feature('Basin Catalog namespaces and tables against the Cloudflare emulator')
  .live("drives the emulator over a real loopback socket with the client generated from Cloudflare's schema")
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A catalog is enabled, repeated enablement is refused and an absent R2 bucket cannot be enabled',
      Gherkin.Do.pipe(
        Given('an account holding an R2 bucket with no catalog')(
          'account',
          () => Effect.map(createBucket(BUCKET), () => ACCOUNT),
        ),
        When('the bucket is enabled as a catalog')('enabled', () => enableCatalog(BUCKET)),
        // slice.json basin-enable-catalog 200: {id, name}; name is account_bucket.
        Then('the activation names the catalog after the account and bucket')((s, expect) =>
          expect({ name: s.enabled.result?.name, success: s.enabled.success }).toEqual({
            name: `${ACCOUNT}_${BUCKET}`,
            success: true,
          })
        ),
        When('the same bucket is enabled again')('duplicate', () => observed(enableCatalog(BUCKET))),
        // slice.json basin-enable-catalog 409.
        Then('the repeat is refused as already enabled')((s, expect) =>
          expect(s.duplicate).toEqual({
            code: 10004,
            kind: 'AlreadyExists',
            message: 'Catalog already enabled.',
            retryAfter: null,
          })
        ),
        When('a bucket that does not exist is enabled')('absent', () => observed(enableCatalog(NEVER_ENABLED))),
        Then('the absent bucket is refused')((s, expect) =>
          expect(s.absent).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'R2 bucket not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'Catalog details and credentials round-trip once the catalog is enabled',
      Gherkin.Do.pipe(
        Given('an account whose bucket is enabled as a catalog')('account', () => withCatalog(BUCKET)),
        When('the catalog details are read')('details', () => catalogDetails(BUCKET)),
        // slice.json basin-get-catalog-details 200.
        Then('the details carry the enabled catalog with no namespaces or tables yet')((s, expect) =>
          expect({
            bucket: s.details.result?.bucket,
            credential_status: s.details.result?.credential_status,
            id_is_hex32: /^[0-9a-f]{32}$/.test(s.details.result?.id ?? ''),
            maintenance_config: s.details.result?.maintenance_config,
            name: s.details.result?.name,
            namespaces: s.details.result?.['namespaces'],
            status: s.details.result?.status,
            tables: s.details.result?.['tables'],
          }).toEqual({
            bucket: BUCKET,
            credential_status: 'absent',
            id_is_hex32: true,
            maintenance_config: DEFAULT_MAINTENANCE,
            name: `${ACCOUNT}_${BUCKET}`,
            namespaces: [],
            status: 'active',
            tables: [],
          })
        ),
        When('a token is stored for the catalog')('stored', () => storeCredential(BUCKET, 'emulator-token')),
        // slice.json basin-store-credentials 200: empty result.
        Then('storing credentials succeeds with an empty result')((s, expect) =>
          expect({ result: s.stored.result, success: s.stored.success }).toEqual({ result: null, success: true })
        ),
        When('the credential status is read')('credStatus', () => credentialStatus(BUCKET)),
        // slice.json basin-get-credential-status 200: probed as valid once present.
        Then('the stored credential probes as valid')((s, expect) =>
          expect(s.credStatus.result).toEqual({ status: 'valid' })
        ),
      ),
    )

    scenario(
      'The catalog maintenance configuration reads, merges, and refuses an absent catalog',
      Gherkin.Do.pipe(
        Given('an account whose bucket is enabled as a catalog')('account', () => withCatalog(BUCKET)),
        When('the catalog maintenance configuration is read')('maintenance', () => getCatalogMaintenance(BUCKET)),
        // slice.json basin-get-maintenance-config 200.
        Then('the maintenance configuration is the default beside the credential status')((s, expect) =>
          expect(s.maintenance.result).toEqual({
            credential_status: 'absent',
            maintenance_config: DEFAULT_MAINTENANCE,
          })
        ),
        When('the maintenance configuration is updated')('updated', () => updateCatalogMaintenance(BUCKET)),
        // slice.json basin-update-maintenance-config 200: merged over the defaults.
        Then('only the supplied fields change and the rest are preserved')((s, expect) =>
          expect(s.updated.result).toEqual({
            compaction: { state: 'disabled', target_size_mb: '512' },
            snapshot_expiration: { state: 'enabled', min_snapshots_to_keep: 5, max_snapshot_age: '7d' },
          })
        ),
        When('the details of a catalog that was never enabled are read')(
          'missingDetails',
          () => observed(catalogDetails(NEVER_ENABLED)),
        ),
        // slice.json basin-get-catalog-details 404.
        Then('the read is refused as catalog not found')((s, expect) =>
          expect(s.missingDetails).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('the credential status of a catalog that was never enabled is read')(
          'missingCredStatus',
          () => observed(credentialStatus(NEVER_ENABLED)),
        ),
        Then('the credential status is refused as catalog not found')((s, expect) =>
          expect(s.missingCredStatus).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('the maintenance configuration of a catalog that was never enabled is read')(
          'missingMaintenance',
          () => observed(getCatalogMaintenance(NEVER_ENABLED)),
        ),
        Then('the maintenance read is refused as catalog not found')((s, expect) =>
          expect(s.missingMaintenance).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('the maintenance configuration of a catalog that was never enabled is updated')(
          'missingUpdate',
          () => observed(updateCatalogMaintenance(NEVER_ENABLED)),
        ),
        Then('the maintenance update is refused as catalog not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('a token is stored for a catalog that was never enabled')(
          'missingStore',
          () => observed(storeCredential(NEVER_ENABLED, 'token')),
        ),
        Then('the store is refused as catalog not found')((s, expect) =>
          expect(s.missingStore).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A catalog is disabled and deleted, and listing answers what remains',
      Gherkin.Do.pipe(
        Given('an account whose bucket is enabled as a catalog')('account', () => withCatalog(BUCKET)),
        When('the catalog is disabled')('disabled', () => disableCatalog(BUCKET)),
        When('the details are read after disabling')('afterDisable', () => catalogDetails(BUCKET)),
        // slice.json basin-disable-catalog 204, then the preserved status.
        Then('the disable answers empty and the catalog becomes inactive')((s, expect) =>
          expect({ disable_answer: s.disabled, status: s.afterDisable.result?.status }).toEqual({
            disable_answer: undefined,
            status: 'inactive',
          })
        ),
        When('the disabled catalog is deleted')('deleted', () => deleteCatalog(BUCKET)),
        When('the catalogs are listed after the delete')('listedAfterDelete', () => listCatalogs()),
        // slice.json basin-delete-catalog 204, basin-list-catalogs 200.
        Then('the delete answers empty and the catalog is gone from the listing')((s, expect) =>
          expect({ delete_answer: s.deleted, warehouses: s.listedAfterDelete.result?.warehouses }).toEqual({
            delete_answer: undefined,
            warehouses: [],
          })
        ),
        When('a catalog that was never enabled is disabled')(
          'missingDisable',
          () => observed(disableCatalog(NEVER_ENABLED)),
        ),
        // slice.json basin-disable-catalog 404.
        Then('the disable is refused as catalog not found')((s, expect) =>
          expect(s.missingDisable).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('a catalog that was never enabled is deleted')(
          'missingDelete',
          () => observed(deleteCatalog(NEVER_ENABLED)),
        ),
        // slice.json basin-delete-catalog 404.
        Then('the delete is refused as catalog not found')((s, expect) =>
          expect(s.missingDelete).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'Seeded namespaces and tables are listed and read back, and their absence is refused',
      Gherkin.Do.pipe(
        Given('a catalog holding a seeded namespace with a committed and a staged table, beside an empty catalog')(
          'account',
          () =>
            Effect.gen(function*() {
              yield* withCatalog(OTHER_BUCKET)
              yield* withCatalog(BUCKET)
              yield* seedTable
              yield* seedStagedTable
              return ACCOUNT
            }),
        ),
        When('the namespaces are listed')('namespaces', () => listNamespaces(BUCKET)),
        // slice.json basin-list-namespaces 200.
        Then('the seeded namespace is listed with a null next page token')((s, expect) =>
          expect(s.namespaces.result).toEqual({ namespaces: [[NAMESPACE]], next_page_token: null })
        ),
        When('the tables of the seeded namespace are listed')('tables', () => listTables(BUCKET, NAMESPACE)),
        // slice.json basin-list-tables 200.
        Then('both seeded table identifiers are listed in seed order')((s, expect) =>
          expect(s.tables.result).toEqual({
            identifiers: [
              { name: TABLE, namespace: [NAMESPACE] },
              { name: 'staging', namespace: [NAMESPACE] },
            ],
            next_page_token: null,
          })
        ),
        When('the seeded table is read')('table', () => getTable(BUCKET, NAMESPACE, TABLE)),
        // slice.json basin-get-table 200.
        Then('the table carries its identifier, Iceberg metadata and snapshot counts')((s, expect) =>
          expect({
            identifier: s.table.result?.identifier,
            metadata: s.table.result?.metadata,
            metadata_location: s.table.result?.metadata_location,
            returned_snapshots: s.table.result?.returned_snapshots,
            table_uuid: s.table.result?.table_uuid,
            total_snapshots: s.table.result?.total_snapshots,
          }).toEqual({
            identifier: { name: TABLE, namespace: [NAMESPACE] },
            metadata: METADATA,
            metadata_location: LOCATION,
            returned_snapshots: 1,
            table_uuid: TABLE_UUID,
            total_snapshots: 1,
          })
        ),
        When('the staged table is read')('staged', () => getTable(BUCKET, NAMESPACE, 'staging')),
        Then('the staged table omits the metadata location and carries no snapshots')((s, expect) =>
          expect({
            has_metadata_location: s.staged.result !== undefined && 'metadata_location' in s.staged.result,
            table_uuid: s.staged.result?.table_uuid,
            total_snapshots: s.staged.result?.total_snapshots,
          }).toEqual({ has_metadata_location: false, table_uuid: STAGED_UUID, total_snapshots: 0 })
        ),
        When('the tables of a namespace that was never seeded are listed')(
          'missingNamespace',
          () => observed(listTables(OTHER_BUCKET, 'absent')),
        ),
        // slice.json basin-list-tables 404.
        Then('the listing is refused as namespace not found')((s, expect) =>
          expect(s.missingNamespace).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Catalog or namespace not found.',
            retryAfter: null,
          })
        ),
        When('a table that was never seeded is read')(
          'missingTable',
          () => observed(getTable(BUCKET, NAMESPACE, 'absent')),
        ),
        // slice.json basin-get-table 404.
        Then('the table read is refused as table not found')((s, expect) =>
          expect(s.missingTable).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Catalog, namespace, or table not found.',
            retryAfter: null,
          })
        ),
        When('a table in a namespace that was never seeded is read')(
          'missingTableNamespace',
          () => observed(getTable(BUCKET, 'absent', TABLE)),
        ),
        Then('the read is refused for the absent namespace too')((s, expect) =>
          expect(s.missingTableNamespace).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Catalog, namespace, or table not found.',
            retryAfter: null,
          })
        ),
        When('the namespaces of a catalog that was never enabled are listed')(
          'missingCatalogNamespaces',
          () => observed(listNamespaces(NEVER_ENABLED)),
        ),
        // slice.json basin-list-namespaces 404.
        Then('the namespace listing is refused as catalog not found')((s, expect) =>
          expect(s.missingCatalogNamespaces).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A seeded table answers its maintenance config, queue and runs',
      Gherkin.Do.pipe(
        Given('a catalog whose namespace and table are seeded twice')(
          'account',
          () =>
            Effect.gen(function*() {
              yield* withSeededTable
              yield* seedTable
              return ACCOUNT
            }),
        ),
        When('the table maintenance configuration is read')(
          'maintenance',
          () => getTableMaintenance(BUCKET, NAMESPACE, TABLE),
        ),
        // slice.json basin-get-table-maintenance-config 200 wraps the config.
        Then('the seeded table config is returned wrapped')((s, expect) =>
          expect(s.maintenance.result).toEqual({ maintenance_config: TABLE_MAINTENANCE })
        ),
        When('the table maintenance configuration is updated')(
          'updated',
          () => updateTableMaintenance(BUCKET, NAMESPACE, TABLE),
        ),
        // slice.json basin-update-table-maintenance-config 200: the merged config itself.
        Then('only the supplied fields change and the rest are preserved')((s, expect) =>
          expect(s.updated.result).toEqual({
            compaction: { state: 'disabled', target_size_mb: '512' },
            snapshot_expiration: { state: 'enabled', min_snapshots_to_keep: 10, max_snapshot_age: '1d' },
          })
        ),
        When('table maintenance is queued with a request id')(
          'queued',
          () => queueTableMaintenance(BUCKET, NAMESPACE, TABLE, REQUEST_ID),
        ),
        // slice.json basin-queue-table-maintenance 202: {queued, message, request_id}.
        Then('the queue answers queued and echoes the request id')((s, expect) =>
          expect(s.queued.result).toEqual({ message: QUEUED_MESSAGE, queued: true, request_id: REQUEST_ID })
        ),
        When('table maintenance is queued without a request id')(
          'queuedWithoutId',
          () => queueTableMaintenance(BUCKET, NAMESPACE, TABLE),
        ),
        Then('the queue answers queued with a null request id')((s, expect) =>
          expect(s.queuedWithoutId.result).toEqual({ message: QUEUED_MESSAGE, queued: true, request_id: null })
        ),
        When('the table maintenance runs are listed')('runs', () => listTableRuns(BUCKET, NAMESPACE, TABLE)),
        // slice.json basin-list-table-maintenance-runs 200.
        Then('the seeded run is listed with a null next page token')((s, expect) =>
          expect(s.runs.result).toEqual({ runs: [RUN], next_page_token: null })
        ),
      ),
    )

    scenario(
      'Table operations refuse a table that was never seeded',
      Gherkin.Do.pipe(
        Given('a catalog holding a seeded namespace and table')('account', () => withSeededTable),
        When('the maintenance configuration of a table that was never seeded is read')(
          'missingMaintenance',
          () => observed(getTableMaintenance(BUCKET, NAMESPACE, 'absent')),
        ),
        // slice.json basin-get-table-maintenance-config 404.
        Then('the maintenance read is refused as table not found')((s, expect) =>
          expect(s.missingMaintenance).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Table not found.',
            retryAfter: null,
          })
        ),
        When('the maintenance configuration of a table that was never seeded is updated')(
          'missingUpdate',
          () => observed(updateTableMaintenance(BUCKET, NAMESPACE, 'absent')),
        ),
        // slice.json basin-update-table-maintenance-config 404.
        Then('the maintenance update is refused as table not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Table not found.',
            retryAfter: null,
          })
        ),
        When('maintenance is queued for a table that was never seeded')(
          'missingQueue',
          () => observed(queueTableMaintenance(BUCKET, NAMESPACE, 'absent')),
        ),
        // slice.json basin-queue-table-maintenance 404.
        Then('the queue is refused as table or configuration not found')((s, expect) =>
          expect(s.missingQueue).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Table or maintenance configuration not found.',
            retryAfter: null,
          })
        ),
        When('the maintenance runs of a table that was never seeded are listed')(
          'missingRuns',
          () => observed(listTableRuns(BUCKET, NAMESPACE, 'absent')),
        ),
        // slice.json basin-list-table-maintenance-runs 404.
        Then('the runs listing is refused as table not found')((s, expect) =>
          expect(s.missingRuns).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Table not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'Table operations refuse a table when the catalog itself is absent',
      Gherkin.Do.pipe(
        Given('an account with no catalog')('account', () => Effect.succeed(ACCOUNT)),
        When('the maintenance configuration of a table in a catalog that was never enabled is read')(
          'missingMaintenance',
          () => observed(getTableMaintenance(NEVER_ENABLED, NAMESPACE, TABLE)),
        ),
        // Every table operation checks the catalog first (slice.json 404 catalog shapes).
        Then('the read is refused as catalog not found')((s, expect) =>
          expect(s.missingMaintenance).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('the maintenance configuration of a table in a catalog that was never enabled is updated')(
          'missingUpdate',
          () => observed(updateTableMaintenance(NEVER_ENABLED, NAMESPACE, TABLE)),
        ),
        Then('the update is refused as catalog not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('maintenance is queued for a table in a catalog that was never enabled')(
          'missingQueue',
          () => observed(queueTableMaintenance(NEVER_ENABLED, NAMESPACE, TABLE)),
        ),
        Then('the queue is refused as catalog not found')((s, expect) =>
          expect(s.missingQueue).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('a table of a catalog that was never enabled is read')(
          'missingTable',
          () => observed(getTable(NEVER_ENABLED, NAMESPACE, TABLE)),
        ),
        Then('the table read is refused as catalog not found')((s, expect) =>
          expect(s.missingTable).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
        When('the tables of a catalog that was never enabled are listed')(
          'missingTables',
          () => observed(listTables(NEVER_ENABLED, NAMESPACE)),
        ),
        Then('the table listing is refused as catalog not found')((s, expect) =>
          expect(s.missingTables).toEqual({
            code: 40401,
            kind: 'NotFound',
            message: 'Catalog not found.',
            retryAfter: null,
          })
        ),
      ),
    )
  })
