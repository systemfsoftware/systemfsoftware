#!/usr/bin/env -S deno run --allow-net=raw.githubusercontent.com --allow-write=packages/cloudflare/alchemy-cloudflare/openapi
// repin-cloudflare-api.ts — pin the Cloudflare OpenAPI contract of
// @systemfsoftware/alchemy-cloudflare.
//
// Fetches `openapi.json` at a cloudflare/api-schemas commit, records the
// source's sha256, and writes the committed slice plus its PIN into
// packages/cloudflare/alchemy-cloudflare/openapi/:
//
//   slice.json  the listed paths (only the methods used) with their
//               transitive #/components closure, every `example` /
//               `examples` key stripped
//   PIN         `commit <sha>` / `sha256 <sha>` of the fetched source
//
// Run it from the repository root:
//
//   ./scripts/tools/repin-cloudflare-api.ts [commit] [--expect-sha=<sha256>]
//
// `--expect-sha` fails the run when the fetched source does not match, which is
// how a re-pin is verified against the recorded PIN.

const DEFAULT_COMMIT = '8118833144f66b6e6da3e82956144a1d524e1972'

const RAW_URL = (commit: string): string =>
  `https://raw.githubusercontent.com/cloudflare/api-schemas/${commit}/openapi.json`

// Path selections. Every entry is `[path, methods]`; only the listed methods
// are carried into the slice. Paths iterate in this order so the slice is
// reproduced byte-for-byte on a re-pin.
const SLICE_PATHS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // K2 streams (stream, subscriptions)
  ['/accounts/{account_id}/k2/streams', ['get', 'post']],
  ['/accounts/{account_id}/k2/streams/{stream_id}', ['get', 'patch', 'delete']],
  ['/accounts/{account_id}/k2/streams/{stream_id}/subscriptions', ['get']],
  ['/accounts/{account_id}/basin-catalog', ['get']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}', ['get']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/credential', ['post']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/credential/status', ['get']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/delete', ['post']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/disable', ['post']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/enable', ['post']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/maintenance-configs', ['get', 'post']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces', ['get']],
  ['/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables', ['get']],
  [
    '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables/{table_name}',
    ['get'],
  ],
  [
    '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables/{table_name}/maintenance-configs',
    ['get', 'post'],
  ],
  [
    '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables/{table_name}/maintenance-configs/{configuration_type}/queue',
    ['post'],
  ],
  [
    '/accounts/{account_id}/basin-catalog/{bucket_name}/namespaces/{namespace}/tables/{table_name}/maintenance-runs',
    ['get'],
  ],
  // Pipelines v1 sinks (streams and pipelines are Alchemy's own resources)
  ['/accounts/{account_id}/pipelines/v1/sinks', ['get', 'post']],
  ['/accounts/{account_id}/pipelines/v1/sinks/{sink_id}', ['get', 'delete']],
  // URL Scanner v2 (Agent Readiness scan, result, search)
  ['/accounts/{account_id}/urlscanner/v2/scan', ['post']],
  ['/accounts/{account_id}/urlscanner/v2/result/{scan_id}', ['get']],
  ['/accounts/{account_id}/urlscanner/v2/search', ['get']],
  // Monetization (account eligibility, zone eligibility, zone rules, rule)
  ['/accounts/{account_id}/monetization', ['get', 'post']],
  ['/zones/{zone_id}/monetization', ['get', 'post']],
  ['/zones/{zone_id}/monetization/rules', ['get', 'put', 'delete']],
  ['/zones/{zone_id}/monetization/rules/{rule_id}', ['get', 'patch', 'delete']],
  // Workers observability issues automations
  ['/accounts/{account_id}/workers/observability/issues/automations', ['get', 'post']],
  [
    '/accounts/{account_id}/workers/observability/issues/automations/{automationId}',
    ['get', 'put', 'delete'],
  ],
  // Alerting v3 destinations/webhooks and policies
  ['/accounts/{account_id}/alerting/v3/destinations/webhooks', ['get', 'post']],
  ['/accounts/{account_id}/alerting/v3/destinations/webhooks/{webhook_id}', ['get', 'put', 'delete']],
  ['/accounts/{account_id}/alerting/v3/policies', ['get', 'post']],
  ['/accounts/{account_id}/alerting/v3/policies/{policy_id}', ['get', 'put', 'delete']],
  // Spectrum applications
  ['/zones/{zone_id}/spectrum/apps', ['get', 'post']],
  ['/zones/{zone_id}/spectrum/apps/{app_id}', ['get', 'put', 'delete']],
  // KV namespaces (Instant mode)
  ['/accounts/{account_id}/storage/kv/namespaces', ['get', 'post']],
  ['/accounts/{account_id}/storage/kv/namespaces/{namespace_id}', ['get', 'put', 'delete']],
  // Zone observability tracing settings and rules
  ['/zones/{zone_id}/observability/tracing/settings', ['get', 'patch', 'delete']],
  ['/zones/{zone_id}/observability/tracing/rules', ['get', 'put', 'delete']],
  // Workers observability destinations and telemetry query (Traces export, Ray ID)
  ['/accounts/{account_id}/workers/observability/destinations', ['get', 'post']],
  ['/accounts/{account_id}/workers/observability/destinations/{slug}', ['patch', 'delete']],
  ['/accounts/{account_id}/workers/observability/telemetry/query', ['post']],
  // Workers scripts: the routes Alchemy's own `Cloudflare.Worker` provider calls
  // for a script's deploy, unchanged redeploy, update and destroy.
  //   list:    WorkerProvider.ts:4876 `workers.listScripts.pages` (also :857 findWorkerId)
  //   put:     WorkerProvider.ts:902  `workers.putScript` (multipart metadata + modules)
  //   delete:  WorkerProvider.ts:937  `workers.deleteScript({ force: true })`
  //   get:     WorkerProvider.ts:765  `workers.getScriptScriptAndVersionSetting`
  //   patch:   WorkerProvider.ts:3869 `workers.patchScriptSetting` (#1992 Issues)
  //   subdomain: WorkerProvider.ts:4410/:1291 `getScriptSubdomain` / `createScriptSubdomain`
  //   account subdomain: WorkerProvider.ts:1277 `workers.getSubdomain`
  ['/accounts/{account_id}/workers/scripts', ['get']],
  ['/accounts/{account_id}/workers/scripts/{script_name}', ['put', 'delete']],
  ['/accounts/{account_id}/workers/scripts/{script_name}/settings', ['get']],
  ['/accounts/{account_id}/workers/scripts/{script_name}/script-settings', ['get', 'patch']],
  ['/accounts/{account_id}/workers/scripts/{script_name}/subdomain', ['get', 'post']],
  ['/accounts/{account_id}/workers/subdomain', ['get']],
  // Containers applications (instances) and image preparations
  ['/accounts/{account_id}/containers/applications', ['get', 'post']],
  ['/accounts/{account_id}/containers/applications/{application_id}', ['get', 'patch', 'delete']],
  ['/accounts/{account_id}/containers/applications/{application_id}/instances', ['get']],
  [
    '/accounts/{account_id}/containers/applications/{application_id}/instances/{instance_id}',
    ['get'],
  ],
  ['/accounts/{account_id}/containers/image-preparations', ['post']],
  // R2 buckets (Basin Catalog's prerequisite)
  ['/accounts/{account_id}/r2/buckets', ['get', 'post']],
  ['/accounts/{account_id}/r2/buckets/{bucket_name}', ['get', 'patch', 'put', 'delete']],
]

// Component sections a $ref may point at. `securitySchemes` is copied whole:
// the top-level `security` requirement names them.
const REF_SECTIONS = [
  'schemas',
  'parameters',
  'responses',
  'requestBodies',
  'headers',
] as const

type JsonObject = { [key: string]: Json }
type Json = null | boolean | number | string | Json[] | JsonObject

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stripExamples = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(stripExamples)
  if (!isObject(value)) return value
  const out: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'example' || key === 'examples') continue
    out[key] = stripExamples(child)
  }
  return out
}

const REF_PATTERN = /^#\/components\/([A-Za-z]+)\/(.+)$/

const unescapePointer = (token: string): string => token.replaceAll('~1', '/').replaceAll('~0', '~')

const collectRefs = (value: Json, into: Array<readonly [string, string]>): void => {
  if (Array.isArray(value)) {
    for (const child of value) collectRefs(child, into)
    return
  }
  if (!isObject(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      const match = REF_PATTERN.exec(child)
      if (match) into.push([match[1]!, unescapePointer(match[2]!)])
      continue
    }
    collectRefs(child, into)
  }
}

const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

class PinError extends Error {}

const fail = (message: string): never => {
  throw new PinError(message)
}

const requireObject = (value: Json | undefined, message: string): JsonObject => {
  if (!isObject(value)) throw new PinError(message)
  return value
}

const requireComponent = (container: Json | undefined, name: string, key: string): Json => {
  const found = isObject(container) ? container[name] : undefined
  if (found === undefined) throw new PinError(`dangling $ref: #/components/${key}`)
  return found
}

const sortEntries = (entries: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

const main = async (): Promise<void> => {
  const args = Deno.args
  const expectSha = args.find((arg) => arg.startsWith('--expect-sha='))?.slice('--expect-sha='.length)
  const commit = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_COMMIT

  const response = await fetch(RAW_URL(commit))
  if (!response.ok) fail(`fetch ${RAW_URL(commit)} failed: ${response.status} ${response.statusText}`)
  const body = await response.arrayBuffer()
  const sourceSha = await sha256Hex(body)

  if (expectSha !== undefined && expectSha !== sourceSha) {
    fail(`sha256 mismatch for ${commit}: expected ${expectSha}, fetched ${sourceSha}`)
  }

  const source = requireObject(
    JSON.parse(new TextDecoder().decode(body)) as Json,
    'fetched document is not a JSON object',
  )
  const sourcePaths = requireObject(source.paths, 'fetched document has no `paths` object')
  const sourceComponents: JsonObject = isObject(source.components) ? source.components : {}

  const paths: JsonObject = {}
  const selected: Array<readonly [string, string]> = []
  for (const [path, methods] of SLICE_PATHS) {
    const item = requireObject(sourcePaths[path], `path not present at ${commit}: ${path}`)
    const sliced: JsonObject = {}
    for (const [key, value] of Object.entries(item)) {
      if (key === 'parameters' || key === '$ref' || methods.includes(key)) sliced[key] = value
    }
    paths[path] = stripExamples(sliced)
    for (const method of methods) {
      requireObject(item[method], `method not present at ${commit}: ${method} ${path}`)
      selected.push([path, method])
    }
  }

  // Transitive component closure: walk every selected path, copy referenced
  // components, and repeat until no new reference appears.
  const components: { [section: string]: JsonObject } = {}
  let pending: Array<readonly [string, string]> = []
  collectRefs(paths, pending)
  const seen = new Set<string>()
  while (pending.length > 0) {
    const next: Array<readonly [string, string]> = []
    for (const [section, name] of pending) {
      const key = `${section}/${name}`
      if (seen.has(key)) continue
      seen.add(key)
      const stripped = stripExamples(requireComponent(sourceComponents[section], name, key))
      ;(components[section] ??= {})[name] = stripped
      collectRefs(stripped, next)
    }
    pending = next
  }

  const orderedComponents: { [section: string]: JsonObject } = {}
  for (const section of REF_SECTIONS) {
    const entries = components[section]
    if (entries !== undefined) orderedComponents[section] = sortEntries(entries)
  }
  if (isObject(sourceComponents.securitySchemes)) {
    orderedComponents.securitySchemes = sortEntries(sourceComponents.securitySchemes)
  }

  const slice: Json = {
    openapi: source.openapi,
    info: source.info,
    servers: source.servers,
    paths,
    components: orderedComponents,
    security: source.security,
  }

  const outDir = new URL('../../packages/cloudflare/alchemy-cloudflare/openapi/', import.meta.url)
  await Deno.mkdir(outDir, { recursive: true })
  await Deno.writeTextFile(new URL('slice.json', outDir), `${JSON.stringify(slice, null, 2)}\n`)
  await Deno.writeTextFile(new URL('PIN', outDir), `commit ${commit}\nsha256 ${sourceSha}\n`)

  console.error(
    `repin-api: ${selected.length} operations, ${Object.keys(paths).length} paths, ` +
      `${seen.size} components, source sha256 ${sourceSha}`,
  )
}

try {
  await main()
} catch (error) {
  if (error instanceof PinError) {
    console.error(error.message)
    Deno.exit(1)
  }
  throw error
}
