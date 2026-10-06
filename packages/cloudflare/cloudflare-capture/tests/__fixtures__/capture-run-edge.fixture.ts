import type { CloudflareEdge, ScriptedResponse, SeenRequest } from './cloudflare-edge.fixture.js'

/** The deterministic run prefix the fixture's `GITHUB_RUN_ID=7` mints. */
export const RUN_PREFIX = 'kiro-ci-7-'

const CASE_FIELD = /"case": "([a-z0-9-]+)"/g

/** Every case id in a rendered fixture, in file order. */
export const caseIdsOf = (fixture: string): ReadonlyArray<string> =>
  [...fixture.matchAll(CASE_FIELD)].map((match) => String(match[1]))

const ORIGINAL_ZONE =
  '{"destinations":[],"enabled":true,"forward_context":false,"persist":false,"propagation_policy":"reject","sampling_ratio":1}'

const ok = (result: string): ScriptedResponse => ({
  status: 200,
  body: `{"success":true,"errors":[],"messages":[],"result":${result}}`,
  headers: {},
})

const fail = (status: number, code: number, message: string): ScriptedResponse => ({
  status,
  body: JSON.stringify({ success: false, errors: [{ code, message }], messages: [], result: null }),
  headers: {},
})

/** A resource record carrying the leaked name under every path the lane reads. */
const leakedRecord = (name: string): string =>
  JSON.stringify({ name, title: name, slug: name, bucket_name: name, description: name, dns: { name } })

export interface CaptureRunEdgeOptions {
  /** When true the edge applies only the first tracing patch and keeps it. */
  readonly keepZonePatched?: boolean
  /** The listing that answers one resource still named with the run prefix. */
  readonly leakedListing?: { readonly urlFragment: string; readonly name: string }
}

/** The edge and the misbehaviour it should script. */
export interface CaptureRunEdgeOf {
  readonly edge: CloudflareEdge
  readonly options?: CaptureRunEdgeOptions
}

/**
 * Points the edge at a well-behaved (or deliberately misbehaving) Cloudflare for
 * a whole capture run: each catalogued case answers its error, each listing
 * answers its resources, and the zone tracing settings are held in the edge's own
 * state so a restore can be observed.
 */
export const scriptCaptureRun = ({ edge, options = {} }: CaptureRunEdgeOf): void => {
  let zone = ORIGINAL_ZONE
  let zonePatched = false
  const counts: Record<string, number> = {}
  const countOf = (key: string): number => {
    const next = (counts[key] ?? 0) + 1
    counts[key] = next
    return next
  }

  edge.script((request: SeenRequest) => {
    const { method, url } = request
    const has = (fragment: string): boolean => url.includes(fragment)

    if (method === 'PATCH' && has('/observability/tracing/settings')) {
      if (options.keepZonePatched !== true || !zonePatched) {
        zone = request.body
        zonePatched = true
      }
      return fail(403, 1005, 'authenticated propagation is not supported yet')
    }
    if (method === 'GET' && has('/observability/tracing/settings')) return ok(zone)
    if (method === 'GET' && has('/k2/streams/')) return fail(404, 1001, 'K2 stream not found')
    if (method === 'POST' && has('/k2/streams')) {
      return countOf('k2') === 1 ? ok('{"id":"stream-1","name":"k2"}') : fail(409, 1002, 'K2 stream already exists')
    }
    if (method === 'DELETE' && has('/k2/streams/')) return ok('null')
    if (method === 'GET' && has('/issues/automations/')) return fail(404, 1003, 'Automation not found')
    if (method === 'POST' && has('/telemetry/query')) return fail(400, 1004, 'from must be earlier than to')
    if (method === 'DELETE' && has('/observability/destinations/')) return fail(404, 1006, 'Destination not found')
    if (method === 'PUT' && has('/monetization/rules')) {
      return fail(403, 1007, 'the request cannot be fulfilled due to policy restrictions')
    }
    if (method === 'GET' && has('/monetization/rules/')) return fail(404, 1008, 'Payment rule not found')
    if (method === 'POST' && has('/spectrum/apps')) {
      return request.body.includes('"protocol"')
        ? countOf('spectrum') === 1
          ? ok('{"id":"app-1"}')
          : fail(409, 1009, 'application already exists')
        : fail(400, 1016, 'the request body is invalid')
    }
    if (method === 'DELETE' && has('/spectrum/apps/')) return ok('null')
    if (method === 'GET' && has('/containers/applications/')) return fail(404, 1010, 'Container instance not found')
    if (method === 'POST' && has('/r2/buckets')) return ok(`{"name":"${RUN_PREFIX}bucket"}`)
    if (method === 'DELETE' && has('/r2/buckets/')) return ok('null')
    if (method === 'POST' && has('/basin-catalog/') && url.endsWith('/enable')) {
      return countOf('basin') === 1 ? ok('{"enabled":true}') : fail(409, 1011, 'Catalog already enabled')
    }
    if (method === 'POST' && has('/storage/kv/namespaces')) {
      return fail(400, 1015, 'Workers KV Instant requires a paid plan')
    }
    if (method === 'DELETE' && has('/storage/kv/namespaces/')) return ok('null')
    if (method === 'GET' && has('/basin-catalog/')) return fail(404, 1013, 'R2 bucket not found')

    if (method === 'GET' && options.leakedListing !== undefined && has(options.leakedListing.urlFragment)) {
      return ok(`[${leakedRecord(options.leakedListing.name)}]`)
    }
    if (method === 'GET' && has('/r2/buckets')) return ok('{"buckets":[]}')
    if (method === 'GET') return ok('[]')
    return ok('null')
  })
}
