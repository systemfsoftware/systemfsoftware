import type { CaptureMethod, RawValue } from './captured-response.schema.js'

/** One HTTP exchange the lane issues. `path` is concrete; only `endpoint` is recorded. */
export interface HttpExchange {
  readonly method: CaptureMethod
  readonly path: string
  readonly body?: RawValue
}

/** The ids and the run prefix every case's concrete request is built from. */
export interface CaseVariables {
  readonly accountId: string
  readonly zoneId: string
  readonly runPrefix: string
}

/** The resource a case's first exchange creates, deleted from the run's finalizer. */
export interface CreatedResource {
  readonly kind: string
  /** JSON path into the create response where the destroy id lives. */
  readonly idPath: ReadonlyArray<string>
  readonly destroy: (variables: CaseVariables, id: string) => HttpExchange
}

/**
 * One catalogued Cloudflare error case. `endpoint` is the generated client's
 * path template and is the recorded coordinate; `exchanges` builds the concrete
 * requests, all of whose responses are discarded except the last — the answer
 * the fixture records. A case whose `creates` is set names its resource with the
 * run prefix and deletes it from the run's scope.
 */
export interface CaptureCase {
  readonly case: string
  readonly operation: string
  readonly method: CaptureMethod
  readonly endpoint: string
  readonly exchanges: (variables: CaseVariables) => ReadonlyArray<HttpExchange>
  readonly creates?: CreatedResource
  /** Whether the case patches zone tracing settings under a snapshot/restore scope. */
  readonly touchesZone?: true
}

/** A syntactically valid id no account can hold, so a not-found case stays not-found. */
const MISSING = '00000000-0000-0000-0000-000000000000'

const account = ({ accountId }: CaseVariables): string => `/accounts/${accountId}`
const zone = ({ zoneId }: CaseVariables): string => `/zones/${zoneId}`
const bucketName = ({ runPrefix }: CaseVariables): string => `${runPrefix}bucket`

const k2Create = (variables: CaseVariables): HttpExchange => ({
  method: 'POST',
  path: `${account(variables)}/k2/streams`,
  body: { name: `${variables.runPrefix}k2`, http: { enabled: true } },
})

const spectrumCreate = (variables: CaseVariables): HttpExchange => ({
  method: 'POST',
  path: `${zone(variables)}/spectrum/apps`,
  body: {
    protocol: 'tcp/8000',
    dns: { name: `${variables.runPrefix}spectrum.systemfsoftware.com`, type: 'A' },
    origin_direct: ['tcp://127.0.0.1:8080'],
  },
})

export const captureCases: ReadonlyArray<CaptureCase> = [
  {
    case: 'k2-stream-not-found',
    operation: 'getV4AccountsByAccount_idK2StreamsByStream_id',
    method: 'GET',
    endpoint: '/accounts/{account_id}/k2/streams/{stream_id}',
    exchanges: (variables) => [{ method: 'GET', path: `${account(variables)}/k2/streams/${MISSING}` }],
  },
  {
    case: 'k2-stream-duplicate',
    operation: 'postV4AccountsByAccount_idK2Streams',
    method: 'POST',
    endpoint: '/accounts/{account_id}/k2/streams',
    creates: {
      kind: 'k2Stream',
      idPath: ['result', 'id'],
      destroy: (variables, id) => ({ method: 'DELETE', path: `${account(variables)}/k2/streams/${id}` }),
    },
    exchanges: (variables) => [k2Create(variables), k2Create(variables)],
  },
  {
    case: 'issues-automation-not-found',
    operation: 'issues.automations.get',
    method: 'GET',
    endpoint: '/accounts/{account_id}/workers/observability/issues/automations/{automationId}',
    exchanges: (variables) => [
      {
        method: 'GET',
        path: `${account(variables)}/workers/observability/issues/automations/${MISSING}`,
      },
    ],
  },
  {
    case: 'telemetry-inverted-timeframe',
    operation: 'telemetry.query',
    method: 'POST',
    endpoint: '/accounts/{account_id}/workers/observability/telemetry/query',
    exchanges: (variables) => [
      {
        method: 'POST',
        path: `${account(variables)}/workers/observability/telemetry/query`,
        body: {
          queryId: `${variables.runPrefix}inverted`,
          timeframe: { from: 1_000_000, to: 1_000 },
          parameters: {},
        },
      },
    ],
  },
  {
    case: 'zone-tracing-authenticated-propagation',
    operation: 'zone.observability.tracing.settings.update',
    method: 'PATCH',
    endpoint: '/zones/{zone_id}/observability/tracing/settings',
    touchesZone: true,
    exchanges: (variables) => [
      {
        method: 'PATCH',
        path: `${zone(variables)}/observability/tracing/settings`,
        body: { propagation_policy: 'authenticated' },
      },
    ],
  },
  {
    case: 'observability-destination-not-found',
    operation: 'destinations.delete',
    method: 'DELETE',
    endpoint: '/accounts/{account_id}/workers/observability/destinations/{slug}',
    exchanges: (variables) => [
      {
        method: 'DELETE',
        path: `${account(variables)}/workers/observability/destinations/${variables.runPrefix}missing`,
      },
    ],
  },
  {
    case: 'monetization-policy-refusal',
    operation: 'monetization-deploy-ruleset',
    method: 'PUT',
    endpoint: '/zones/{zone_id}/monetization/rules',
    exchanges: (variables) => [
      { method: 'PUT', path: `${zone(variables)}/monetization/rules`, body: { rules: [] } },
    ],
  },
  {
    case: 'monetization-rule-not-found',
    operation: 'monetization-get-rule',
    method: 'GET',
    endpoint: '/zones/{zone_id}/monetization/rules/{rule_id}',
    exchanges: (variables) => [
      { method: 'GET', path: `${zone(variables)}/monetization/rules/${MISSING}` },
    ],
  },
  {
    case: 'spectrum-invalid-body',
    operation: 'spectrum-applications-create-spectrum-application-using-a-name-for-the-origin',
    method: 'POST',
    endpoint: '/zones/{zone_id}/spectrum/apps',
    exchanges: (variables) => [
      {
        method: 'POST',
        path: `${zone(variables)}/spectrum/apps`,
        body: { dns: { name: `${variables.runPrefix}invalid.systemfsoftware.com`, type: 'A' } },
      },
    ],
  },
  {
    case: 'spectrum-identity-taken',
    operation: 'spectrum-applications-create-spectrum-application-using-a-name-for-the-origin',
    method: 'POST',
    endpoint: '/zones/{zone_id}/spectrum/apps',
    creates: {
      kind: 'spectrumApp',
      idPath: ['result', 'id'],
      destroy: (variables, id) => ({ method: 'DELETE', path: `${zone(variables)}/spectrum/apps/${id}` }),
    },
    exchanges: (variables) => [spectrumCreate(variables), spectrumCreate(variables)],
  },
  {
    case: 'container-instance-not-found',
    operation: 'getContainerInstance',
    method: 'GET',
    endpoint: '/accounts/{account_id}/containers/applications/{application_id}/instances/{instance_id}',
    exchanges: (variables) => [
      {
        method: 'GET',
        path: `${account(variables)}/containers/applications/${MISSING}/instances/${MISSING}`,
      },
    ],
  },
  {
    case: 'basin-already-enabled',
    operation: 'basin-enable-catalog',
    method: 'POST',
    endpoint: '/accounts/{account_id}/basin-catalog/{bucket_name}/enable',
    creates: {
      kind: 'r2Bucket',
      idPath: ['result', 'name'],
      destroy: (variables, id) => ({ method: 'DELETE', path: `${account(variables)}/r2/buckets/${id}` }),
    },
    exchanges: (variables) => [
      { method: 'POST', path: `${account(variables)}/r2/buckets`, body: { name: bucketName(variables) } },
      { method: 'POST', path: `${account(variables)}/basin-catalog/${bucketName(variables)}/enable` },
      { method: 'POST', path: `${account(variables)}/basin-catalog/${bucketName(variables)}/enable` },
    ],
  },
  {
    case: 'basin-namespace-not-found',
    operation: 'basin-list-tables',
    method: 'GET',
    endpoint: '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables',
    exchanges: (variables) => [
      {
        method: 'GET',
        path: `${
          account(variables)
        }/basin-catalog/${variables.runPrefix}missing/namespaces/${variables.runPrefix}missing/tables`,
      },
    ],
  },
  {
    case: 'basin-bucket-not-found',
    operation: 'basin-get-catalog-details',
    method: 'GET',
    endpoint: '/accounts/{account_id}/basin-catalog/{bucket_name}',
    exchanges: (variables) => [
      { method: 'GET', path: `${account(variables)}/basin-catalog/${variables.runPrefix}missing` },
    ],
  },
  {
    case: 'basin-table-not-found',
    operation: 'basin-get-table',
    method: 'GET',
    endpoint: '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables/{table_name}',
    exchanges: (variables) => [
      {
        method: 'GET',
        path: `${
          account(variables)
        }/basin-catalog/${variables.runPrefix}missing/namespaces/${variables.runPrefix}missing/tables/${variables.runPrefix}missing`,
      },
    ],
  },
  {
    case: 'kv-instant-entitlement',
    operation: 'workers-kv-namespace-create-a-namespace',
    method: 'POST',
    endpoint: '/accounts/{account_id}/storage/kv/namespaces',
    creates: {
      kind: 'kvNamespace',
      idPath: ['result', 'id'],
      destroy: (variables, id) => ({
        method: 'DELETE',
        path: `${account(variables)}/storage/kv/namespaces/${id}`,
      }),
    },
    exchanges: (variables) => [
      {
        method: 'POST',
        path: `${account(variables)}/storage/kv/namespaces`,
        body: { title: `${variables.runPrefix}kv-instant`, mode: 'instant' },
      },
    ],
  },
]
