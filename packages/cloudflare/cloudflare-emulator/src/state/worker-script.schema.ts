import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const WorkerOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/WorkerScriptOutcome',
)
type WorkerOutcomeTypeId = typeof WorkerOutcomeTypeId

// The multipart upload carries the metadata as the JSON text part the wire
// format uses, so the emulator decodes it with this schema (patch reason:
// openapi/patches.json, `workers_multipart-script.properties.metadata`).
export const WorkerObservabilityLogs = Schema.Struct({
  destinations: Schema.optionalKey(Schema.Array(Schema.String)),
  enabled: Schema.optionalKey(Schema.Boolean),
  head_sampling_rate: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  invocation_logs: Schema.optionalKey(Schema.Boolean),
  persist: Schema.optionalKey(Schema.Boolean),
})
export type WorkerObservabilityLogs = typeof WorkerObservabilityLogs.Type

export const WorkerObservabilityTraces = Schema.Struct({
  destinations: Schema.optionalKey(Schema.Array(Schema.String)),
  enabled: Schema.optionalKey(Schema.Boolean),
  head_sampling_rate: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  persist: Schema.optionalKey(Schema.Boolean),
  propagation_policy: Schema.optionalKey(
    Schema.NullOr(Schema.Literals(['authenticated', 'accept'])),
  ),
})
export type WorkerObservabilityTraces = typeof WorkerObservabilityTraces.Type

export const WorkerObservabilityIssues = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
})
export type WorkerObservabilityIssues = typeof WorkerObservabilityIssues.Type

/** Observability as accepted by upload metadata and `PATCH script-settings`. */
export const WorkerObservabilityInput = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  head_sampling_rate: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  issues: Schema.optionalKey(Schema.NullOr(WorkerObservabilityIssues)),
  logs: Schema.optionalKey(Schema.NullOr(WorkerObservabilityLogs)),
  redact_query_string: Schema.optionalKey(Schema.Boolean),
  traces: Schema.optionalKey(Schema.NullOr(WorkerObservabilityTraces)),
})
export type WorkerObservabilityInput = typeof WorkerObservabilityInput.Type

/** Observability as Cloudflare returns it: every documented field present. */
export const WorkerObservability = Schema.Struct({
  enabled: Schema.Boolean,
  head_sampling_rate: Schema.NullOr(Schema.Finite),
  issues: Schema.Struct({ enabled: Schema.Boolean }),
  logs: Schema.NullOr(
    Schema.Struct({
      destinations: Schema.Array(Schema.String),
      enabled: Schema.Boolean,
      head_sampling_rate: Schema.NullOr(Schema.Finite),
      invocation_logs: Schema.Boolean,
      persist: Schema.Boolean,
    }),
  ),
  redact_query_string: Schema.Boolean,
  traces: Schema.NullOr(
    Schema.Struct({
      destinations: Schema.Array(Schema.String),
      enabled: Schema.Boolean,
      head_sampling_rate: Schema.NullOr(Schema.Finite),
      persist: Schema.Boolean,
      propagation_policy: Schema.NullOr(Schema.Literals(['authenticated', 'accept'])),
    }),
  ),
})
export type WorkerObservability = typeof WorkerObservability.Type

export const WorkerTailConsumer = Schema.Struct({
  environment: Schema.optionalKey(Schema.String),
  namespace: Schema.optionalKey(Schema.String),
  service: Schema.String,
})
export type WorkerTailConsumer = typeof WorkerTailConsumer.Type

export const WorkerLimits = Schema.Struct({
  cpu_ms: Schema.optionalKey(Schema.Finite),
  subrequests: Schema.optionalKey(Schema.Finite),
})
export type WorkerLimits = typeof WorkerLimits.Type

export const WorkerBinding = Schema.Record(Schema.String, Schema.Json)
export type WorkerBinding = typeof WorkerBinding.Type

/** One module part of an uploaded script, read off the multipart body. */
export const WorkerModule = Schema.Struct({
  content: Schema.String,
  contentType: Schema.String,
  name: Schema.String,
})
export type WorkerModule = typeof WorkerModule.Type

/** A part of a persisted multipart body, as Effect decodes it. */
export const WorkerUploadPart = Schema.TaggedStruct('PersistedFile', {
  contentType: Schema.String,
  key: Schema.String,
  name: Schema.String,
  path: Schema.String,
})
export type WorkerUploadPart = typeof WorkerUploadPart.Type

export const WorkerAnnotations = Schema.Struct({
  'workers/message': Schema.optionalKey(Schema.String),
  'workers/tag': Schema.optionalKey(Schema.String),
  'workers/triggered_by': Schema.optionalKey(Schema.String),
})
export type WorkerAnnotations = typeof WorkerAnnotations.Type

/** The metadata JSON part Cloudflare's multipart upload documents. */
export const WorkerUploadMetadata = Schema.Struct({
  annotations: Schema.optionalKey(WorkerAnnotations),
  assets: Schema.optionalKey(Schema.Json),
  bindings: Schema.optionalKey(Schema.Array(WorkerBinding)),
  body_part: Schema.optionalKey(Schema.String),
  cache_options: Schema.optionalKey(Schema.Json),
  compatibility_date: Schema.optionalKey(Schema.String),
  compatibility_flags: Schema.optionalKey(Schema.Array(Schema.String)),
  exports: Schema.optionalKey(Schema.Json),
  keep_assets: Schema.optionalKey(Schema.Boolean),
  keep_bindings: Schema.optionalKey(Schema.Array(Schema.String)),
  limits: Schema.optionalKey(WorkerLimits),
  logpush: Schema.optionalKey(Schema.Boolean),
  main_module: Schema.optionalKey(Schema.String),
  migrations: Schema.optionalKey(Schema.Json),
  observability: Schema.optionalKey(WorkerObservabilityInput),
  package_dependencies: Schema.optionalKey(Schema.Json),
  placement: Schema.optionalKey(Schema.Json),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  tail_consumers: Schema.optionalKey(Schema.Array(WorkerTailConsumer)),
  usage_model: Schema.optionalKey(Schema.String),
})
export type WorkerUploadMetadata = typeof WorkerUploadMetadata.Type

export const WorkerSubdomain = Schema.Struct({
  enabled: Schema.Boolean,
  previews_enabled: Schema.Boolean,
})
export type WorkerSubdomain = typeof WorkerSubdomain.Type

/** Everything Cloudflare keeps for one script at its name. */
export const WorkerScript = Schema.Struct({
  annotations: Schema.optional(WorkerAnnotations),
  bindings: Schema.Array(Schema.Json),
  cache_options: Schema.optional(Schema.Json),
  compatibility_date: Schema.String,
  compatibility_flags: Schema.Array(Schema.String),
  created_on: Schema.String,
  entry_point: Schema.String,
  etag: Schema.String,
  exports: Schema.optional(Schema.Json),
  handlers: Schema.Array(Schema.String),
  has_assets: Schema.Boolean,
  has_modules: Schema.Boolean,
  limits: Schema.optional(Schema.Json),
  logpush: Schema.Boolean,
  main_module: Schema.optional(Schema.String),
  migrations: Schema.optional(Schema.Json),
  modified_on: Schema.String,
  modules: Schema.Array(WorkerModule),
  observability: WorkerObservability,
  placement: Schema.optional(Schema.Json),
  script_name: Schema.String,
  subdomain: WorkerSubdomain,
  tags: Schema.Array(Schema.String),
  tail_consumers: Schema.Array(WorkerTailConsumer),
  usage_model: Schema.String,
})
export type WorkerScript = typeof WorkerScript.Type

export const AccountSubdomain = Schema.String
export type AccountSubdomain = typeof AccountSubdomain.Type

export const WorkerScriptState = Schema.Struct({
  scripts: Schema.Array(WorkerScript),
  subdomain: AccountSubdomain,
})
export type WorkerScriptState = typeof WorkerScriptState.Type

/** What a script's subdomain is for a script nobody has posted yet. */
export const emptyWorkerSubdomain: WorkerSubdomain = { enabled: false, previews_enabled: false }

export const defaultAccountSubdomain: AccountSubdomain = 'emulator'

export const emptyWorkerScriptState: WorkerScriptState = {
  scripts: [],
  subdomain: defaultAccountSubdomain,
}

export const WorkerUploadParts = Schema.Array(WorkerUploadPart)
export type WorkerUploadParts = typeof WorkerUploadParts.Type

export const WorkerUploadBody = Schema.Record(Schema.String, Schema.Union([Schema.String, WorkerUploadParts]))
export type WorkerUploadBody = typeof WorkerUploadBody.Type

export const WorkerUploadForm = Schema.Struct({
  metadata: Schema.fromJsonString(WorkerUploadMetadata),
})
export type WorkerUploadForm = typeof WorkerUploadForm.Type

export const WorkerSettingsPatch = Schema.Struct({
  logpush: Schema.optional(Schema.Boolean),
  observability: Schema.optional(WorkerObservabilityInput),
  tags: Schema.optional(Schema.Array(Schema.String)),
  tail_consumers: Schema.optional(Schema.Array(WorkerTailConsumer)),
})
export type WorkerSettingsPatch = typeof WorkerSettingsPatch.Type

export const WorkerScriptContent = Schema.Struct({
  metadata: WorkerUploadMetadata,
  modules: Schema.Array(WorkerModule),
})
export type WorkerScriptContent = typeof WorkerScriptContent.Type

export class ListWorkerScripts extends Schema.TaggedClass<ListWorkerScripts>()('ListWorkerScripts', {}) {}

export class UploadWorkerScript extends Schema.TaggedClass<UploadWorkerScript>()('UploadWorkerScript', {
  entry_point: Schema.String,
  etag: Schema.String,
  metadata: WorkerUploadMetadata,
  modules: Schema.Array(WorkerModule),
  script_name: Schema.String,
}) {}

export class DeleteWorkerScript extends Schema.TaggedClass<DeleteWorkerScript>()('DeleteWorkerScript', {
  force: Schema.optional(Schema.Boolean),
  script_name: Schema.String,
}) {}

export class GetWorkerScriptSettings extends Schema.TaggedClass<GetWorkerScriptSettings>()(
  'GetWorkerScriptSettings',
  { script_name: Schema.String },
) {}

export class GetWorkerScriptSettingsItem extends Schema.TaggedClass<GetWorkerScriptSettingsItem>()(
  'GetWorkerScriptSettingsItem',
  { script_name: Schema.String },
) {}

export class PatchWorkerScriptSettingsItem extends Schema.TaggedClass<PatchWorkerScriptSettingsItem>()(
  'PatchWorkerScriptSettingsItem',
  {
    logpush: Schema.optional(Schema.Boolean),
    observability: Schema.optional(WorkerObservabilityInput),
    script_name: Schema.String,
    tags: Schema.optional(Schema.Array(Schema.String)),
    tail_consumers: Schema.optional(Schema.Array(WorkerTailConsumer)),
  },
) {}

export class GetWorkerScriptSubdomain extends Schema.TaggedClass<GetWorkerScriptSubdomain>()(
  'GetWorkerScriptSubdomain',
  { script_name: Schema.String },
) {}

export class PostWorkerScriptSubdomain extends Schema.TaggedClass<PostWorkerScriptSubdomain>()(
  'PostWorkerScriptSubdomain',
  {
    enabled: Schema.Boolean,
    previews_enabled: Schema.optional(Schema.Boolean),
    script_name: Schema.String,
  },
) {}

export class GetWorkerSubdomain extends Schema.TaggedClass<GetWorkerSubdomain>()('GetWorkerSubdomain', {}) {}

export const WorkerScriptRequest = Schema.Union([
  ListWorkerScripts,
  UploadWorkerScript,
  DeleteWorkerScript,
  GetWorkerScriptSettings,
  GetWorkerScriptSettingsItem,
  PatchWorkerScriptSettingsItem,
  GetWorkerScriptSubdomain,
  PostWorkerScriptSubdomain,
  GetWorkerSubdomain,
])
export type WorkerScriptRequest = typeof WorkerScriptRequest.Type

export class WorkerScriptApplied extends Schema.TaggedClass<WorkerScriptApplied>()('WorkerScriptApplied', {
  state: WorkerScriptState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [WorkerOutcomeTypeId] = WorkerOutcomeTypeId
}

export class WorkerScriptRefused extends Schema.TaggedClass<WorkerScriptRefused>()('WorkerScriptRefused', {
  state: WorkerScriptState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [WorkerOutcomeTypeId] = WorkerOutcomeTypeId
}

export const WorkerScriptOutcome = Schema.Union([WorkerScriptApplied, WorkerScriptRefused])
export type WorkerScriptOutcome = typeof WorkerScriptOutcome.Type

export class WorkerScriptCommand extends Schema.TaggedClass<WorkerScriptCommand>()('WorkerScriptCommand', {
  now: Schema.String,
  state: WorkerScriptState,
  request: WorkerScriptRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
