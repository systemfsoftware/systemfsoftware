import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  DeleteWorkerScript,
  emptyWorkerSubdomain,
  GetWorkerScriptSettings,
  GetWorkerScriptSettingsItem,
  GetWorkerScriptSubdomain,
  GetWorkerSubdomain,
  ListWorkerScripts,
  PatchWorkerScriptSettingsItem,
  PostWorkerScriptSubdomain,
  UploadWorkerScript,
  WorkerScript,
  WorkerScriptApplied,
  WorkerScriptCommand,
  WorkerScriptOutcome,
  WorkerScriptRefused,
  WorkerScriptState,
} from './worker-script.schema.js'
import type {
  WorkerLimits,
  WorkerObservability,
  WorkerObservabilityInput,
  WorkerObservabilityLogs,
  WorkerObservabilityTraces,
  WorkerSubdomain,
  WorkerTailConsumer,
  WorkerUploadMetadata,
} from './worker-script.schema.js'

type Entry = readonly [string, Schema.Json]

const pair = (key: string, value: Schema.Json): Entry => [key, value]

const objectOf = (entries: ReadonlyArray<Entry>): Schema.Json => Object.fromEntries(entries)

const always = (key: string, value: Schema.Json): Option.Option<Entry> => Option.some(pair(key, value))

const present = (key: string, value: Option.Option<Schema.Json>): Option.Option<Entry> =>
  Option.map(value, (found) => pair(key, found))

const record = (entries: ReadonlyArray<Option.Option<Entry>>): Schema.Json => objectOf(Array.getSomes(entries))

const orUndefined = <A>(value: A | undefined): Option.Option<A> => Option.fromUndefinedOr(value)

const orNull = <A>(value: A | null | undefined): Option.Option<NonNullable<A>> => Option.fromNullishOr(value)

const orDefault =
  <A>(fallback: A) =>
  (value: A | undefined): A =>
    Option.getOrElse(orUndefined(value), () => fallback)

// Cloudflare's script-not-found error code; distilled matches `WorkerNotFound`
// on code 10007.
const notFound = (state: WorkerScriptState): WorkerScriptRefused =>
  WorkerScriptRefused.make({
    state,
    status: 404,
    body: failureEnvelope({ code: 10007, message: 'workers.api.error.script_not_found' }),
  })

const normalizeLogs = (logs: WorkerObservabilityLogs): NonNullable<WorkerObservability['logs']> => ({
  destinations: orDefault<ReadonlyArray<string>>([])(logs.destinations),
  enabled: orDefault(false)(logs.enabled),
  head_sampling_rate: orDefault<number | null>(null)(logs.head_sampling_rate),
  invocation_logs: orDefault(false)(logs.invocation_logs),
  persist: orDefault(true)(logs.persist),
})

const normalizeTraces = (traces: WorkerObservabilityTraces): NonNullable<WorkerObservability['traces']> => ({
  destinations: orDefault<ReadonlyArray<string>>([])(traces.destinations),
  enabled: orDefault(false)(traces.enabled),
  head_sampling_rate: orDefault<number | null>(null)(traces.head_sampling_rate),
  persist: orDefault(true)(traces.persist),
  propagation_policy: orDefault<'authenticated' | 'accept' | null>(null)(traces.propagation_policy),
})

const issuesOf = (observability: WorkerObservabilityInput): WorkerObservability['issues'] => ({
  enabled: Option.getOrElse(
    Option.flatMap(orNull(observability.issues), (issues) => orUndefined(issues.enabled)),
    () => false,
  ),
})

const normalizeObservability = (observability: WorkerObservabilityInput | undefined): WorkerObservability => {
  const input = Option.getOrElse(orUndefined(observability), (): WorkerObservabilityInput => ({}))
  return {
    enabled: orDefault(false)(input.enabled),
    head_sampling_rate: orDefault<number | null>(null)(input.head_sampling_rate),
    issues: issuesOf(input),
    logs: Option.match(orNull(input.logs), { onNone: () => null, onSome: normalizeLogs }),
    redact_query_string: orDefault(false)(input.redact_query_string),
    traces: Option.match(orNull(input.traces), { onNone: () => null, onSome: normalizeTraces }),
  }
}

const normalizeLimits = (limits: WorkerLimits | undefined): Option.Option<Schema.Json> =>
  Option.map(orUndefined(limits), (present_) =>
    objectOf([
      ...Array.getSomes([present('cpu_ms', orUndefined(present_.cpu_ms))]),
      ...Array.getSomes([present('subrequests', orUndefined(present_.subrequests))]),
    ]))

const scriptBindings = (metadata: WorkerUploadMetadata): ReadonlyArray<Schema.Json> =>
  Option.getOrElse(orUndefined(metadata.bindings), (): ReadonlyArray<Schema.Json> => [])

const scriptTags = (metadata: WorkerUploadMetadata): ReadonlyArray<string> =>
  Option.getOrElse(orUndefined(metadata.tags), (): ReadonlyArray<string> => [])

const scriptTailConsumers = (metadata: WorkerUploadMetadata): ReadonlyArray<WorkerTailConsumer> =>
  Option.getOrElse(orUndefined(metadata.tail_consumers), (): ReadonlyArray<WorkerTailConsumer> => [])

const mainModuleOf = (metadata: WorkerUploadMetadata): Option.Option<string> =>
  Option.firstSomeOf([orUndefined(metadata.main_module), orUndefined(metadata.body_part)])

const buildScript = (
  command: WorkerScriptCommand,
  request: UploadWorkerScript,
  previous: Option.Option<WorkerScript>,
): WorkerScript => ({
  annotations: Option.getOrUndefined(orUndefined(request.metadata.annotations)),
  bindings: scriptBindings(request.metadata),
  cache_options: Option.getOrUndefined(orUndefined(request.metadata.cache_options)),
  compatibility_date: orDefault('')(request.metadata.compatibility_date),
  compatibility_flags: orDefault<ReadonlyArray<string>>([])(request.metadata.compatibility_flags),
  created_on: Option.getOrElse(Option.map(previous, (script) => script.created_on), () => command.now),
  entry_point: request.entry_point,
  etag: request.etag,
  exports: Option.getOrUndefined(orUndefined(request.metadata.exports)),
  handlers: ['fetch'],
  has_assets: false,
  has_modules: Option.isSome(Array.head(request.modules)),
  limits: Option.getOrUndefined(normalizeLimits(request.metadata.limits)),
  logpush: orDefault(false)(request.metadata.logpush),
  main_module: Option.getOrUndefined(mainModuleOf(request.metadata)),
  migrations: Option.getOrUndefined(orUndefined(request.metadata.migrations)),
  modified_on: command.now,
  modules: request.modules,
  observability: normalizeObservability(request.metadata.observability),
  placement: Option.getOrUndefined(orUndefined(request.metadata.placement)),
  script_name: request.script_name,
  subdomain: Option.getOrElse(Option.map(previous, (script) => script.subdomain), () => emptyWorkerSubdomain),
  tags: scriptTags(request.metadata),
  tail_consumers: scriptTailConsumers(request.metadata),
  usage_model: orDefault('standard')(request.metadata.usage_model),
})

const findScript = (state: WorkerScriptState, scriptName: string): Option.Option<WorkerScript> =>
  Array.findFirst(state.scripts, (script) => script.script_name === scriptName)

const withoutScript = (state: WorkerScriptState, scriptName: string): WorkerScriptState => ({
  ...state,
  scripts: Array.filter(state.scripts, (script) => script.script_name !== scriptName),
})

const withScript = (state: WorkerScriptState, script: WorkerScript): WorkerScriptState => {
  const remaining = withoutScript(state, script.script_name)
  return { ...remaining, scripts: Array.append(remaining.scripts, script) }
}

const cacheOptions = (script: WorkerScript): Schema.Json =>
  Option.getOrElse(orUndefined(script.cache_options), () =>
    objectOf([pair('cross_version_cache', false), pair('enabled', false)]))

const settingsEntries = (script: WorkerScript): ReadonlyArray<Option.Option<Entry>> => [
  present('annotations', orUndefined(script.annotations)),
  always('bindings', script.bindings),
  always('cache_options', cacheOptions(script)),
  always('compatibility_date', script.compatibility_date),
  always('compatibility_flags', script.compatibility_flags),
  present('exports', orUndefined(script.exports)),
  present('limits', orUndefined(script.limits)),
  always('logpush', script.logpush),
  present('migrations', orUndefined(script.migrations)),
  always('observability', script.observability),
  present('placement', orUndefined(script.placement)),
  always('tags', script.tags),
  always('tail_consumers', script.tail_consumers),
  always('usage_model', script.usage_model),
]

const settingsItem = (script: WorkerScript): Schema.Json => record(settingsEntries(script))

const scriptSettings = (script: WorkerScript): Schema.Json =>
  record([
    always('logpush', script.logpush),
    always('observability', script.observability),
    always('tags', script.tags),
    always('tail_consumers', script.tail_consumers),
  ])

const responseEntries = (script: WorkerScript): ReadonlyArray<Option.Option<Entry>> => [
  always('cache_options', cacheOptions(script)),
  always('compatibility_date', script.compatibility_date),
  always('compatibility_flags', script.compatibility_flags),
  always('created_on', script.created_on),
  always('etag', script.etag),
  always('has_assets', script.has_assets),
  always('has_modules', script.has_modules),
  always('id', script.script_name),
  always('logpush', script.logpush),
  always('modified_on', script.modified_on),
  always('observability', script.observability),
  present('placement', orUndefined(script.placement)),
  always('tag', script.script_name),
  always('tags', script.tags),
  always('tail_consumers', script.tail_consumers),
  always('usage_model', script.usage_model),
]

const uploadResponse = (script: WorkerScript): Schema.Json =>
  record(
    Array.appendAll(responseEntries(script), [
      always('entry_point', script.entry_point),
      always('startup_time_ms', 0),
    ]),
  )

const uploadScript = (command: WorkerScriptCommand, request: UploadWorkerScript): WorkerScriptOutcome => {
  const script = buildScript(command, request, findScript(command.state, request.script_name))
  return WorkerScriptApplied.make({
    state: withScript(command.state, script),
    status: 200,
    body: successEnvelope(uploadResponse(script)),
  })
}

const listScripts = (command: WorkerScriptCommand, _request: ListWorkerScripts): WorkerScriptOutcome =>
  WorkerScriptApplied.make({
    state: command.state,
    status: 200,
    body: listEnvelope({
      result: Array.map(command.state.scripts, (script) =>
        record(Array.append(responseEntries(script), always('routes', [])))),
      info: {
        page: 1,
        per_page: command.state.scripts.length,
        total_count: command.state.scripts.length,
      },
    }),
  })

const deleteScript = (command: WorkerScriptCommand, request: DeleteWorkerScript): WorkerScriptOutcome =>
  WorkerScriptApplied.make({
    state: withoutScript(command.state, request.script_name),
    status: 200,
    body: successEnvelope(null),
  })

const getScriptSettings = (command: WorkerScriptCommand, request: GetWorkerScriptSettings): WorkerScriptOutcome =>
  Option.match(findScript(command.state, request.script_name), {
    onNone: () => notFound(command.state),
    onSome: (script) =>
      WorkerScriptApplied.make({ state: command.state, status: 200, body: successEnvelope(settingsItem(script)) }),
  })

const getScriptSettingsItem = (
  command: WorkerScriptCommand,
  request: GetWorkerScriptSettingsItem,
): WorkerScriptOutcome =>
  Option.match(findScript(command.state, request.script_name), {
    onNone: () => notFound(command.state),
    onSome: (script) =>
      WorkerScriptApplied.make({ state: command.state, status: 200, body: successEnvelope(scriptSettings(script)) }),
  })

const patchedScript = (current: WorkerScript, request: PatchWorkerScriptSettingsItem): WorkerScript => ({
  ...current,
  logpush: orDefault(current.logpush)(request.logpush),
  observability: Option.getOrElse(
    Option.map(orUndefined(request.observability), normalizeObservability),
    () => current.observability,
  ),
  tags: orDefault(current.tags)(request.tags),
  tail_consumers: orDefault(current.tail_consumers)(request.tail_consumers),
})

const patchScriptSettings = (
  command: WorkerScriptCommand,
  request: PatchWorkerScriptSettingsItem,
): WorkerScriptOutcome =>
  Option.match(findScript(command.state, request.script_name), {
    onNone: () => notFound(command.state),
    onSome: (script) => {
      const patched = patchedScript(script, request)
      return WorkerScriptApplied.make({
        state: withScript(command.state, patched),
        status: 200,
        body: successEnvelope(scriptSettings(patched)),
      })
    },
  })

const getScriptSubdomain = (command: WorkerScriptCommand, request: GetWorkerScriptSubdomain): WorkerScriptOutcome =>
  Option.match(findScript(command.state, request.script_name), {
    onNone: () => notFound(command.state),
    onSome: (script) =>
      WorkerScriptApplied.make({ state: command.state, status: 200, body: successEnvelope(script.subdomain) }),
  })

const postScriptSubdomain = (command: WorkerScriptCommand, request: PostWorkerScriptSubdomain): WorkerScriptOutcome => {
  const subdomain: WorkerSubdomain = {
    enabled: request.enabled,
    previews_enabled: orDefault(false)(request.previews_enabled),
  }
  return Option.match(findScript(command.state, request.script_name), {
    onNone: () => notFound(command.state),
    onSome: (script) =>
      WorkerScriptApplied.make({
        state: withScript(command.state, { ...script, subdomain }),
        status: 200,
        body: successEnvelope(subdomain),
      }),
  })
}

const getAccountSubdomain = (command: WorkerScriptCommand, _request: GetWorkerSubdomain): WorkerScriptOutcome =>
  WorkerScriptApplied.make({
    state: command.state,
    status: 200,
    body: successEnvelope({ subdomain: command.state.subdomain }),
  })

const decide = (command: WorkerScriptCommand): Result.Result<WorkerScriptOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListWorkerScripts', (request) => listScripts(command, request)),
      Match.tag('UploadWorkerScript', (request) => uploadScript(command, request)),
      Match.tag('DeleteWorkerScript', (request) => deleteScript(command, request)),
      Match.tag('GetWorkerScriptSettings', (request) => getScriptSettings(command, request)),
      Match.tag('GetWorkerScriptSettingsItem', (request) => getScriptSettingsItem(command, request)),
      Match.tag('PatchWorkerScriptSettingsItem', (request) => patchScriptSettings(command, request)),
      Match.tag('GetWorkerScriptSubdomain', (request) => getScriptSubdomain(command, request)),
      Match.tag('PostWorkerScriptSubdomain', (request) => postScriptSubdomain(command, request)),
      Match.tag('GetWorkerSubdomain', (request) => getAccountSubdomain(command, request)),
      Match.exhaustive,
    ),
  )

export const workerScript = Workflow.make({
  command: WorkerScriptCommand,
  decision: WorkerScriptOutcome,
  error: Schema.Never,
  decide,
})
