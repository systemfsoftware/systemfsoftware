import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import type {
  WorkerScriptSettingsPatchSettingsRequestJson,
  WorkerScriptUploadWorkerModuleRequestFormData,
} from '@systemfsoftware/alchemy-cloudflare/api'
import { Array, Effect, Match, Option, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'
import { settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import type { EmulatorState } from '../state/emulator-state.js'
import {
  DeleteWorkerScript,
  GetWorkerScriptSettings,
  GetWorkerScriptSettingsItem,
  GetWorkerScriptSubdomain,
  ListWorkerScripts,
  PatchWorkerScriptSettingsItem,
  PostWorkerScriptSubdomain,
  UploadWorkerScript,
  WorkerModule,
  WorkerScriptCommand,
  WorkerScriptContent,
  WorkerSettingsPatch,
  WorkerUploadBody,
  WorkerUploadForm,
  WorkerUploadParts,
} from '../state/worker-script.schema.js'
import type {
  WorkerModule as WorkerModuleType,
  WorkerScriptRequest,
  WorkerScriptState,
  WorkerUploadMetadata,
  WorkerUploadPart,
} from '../state/worker-script.schema.js'
import { workerScript } from '../state/worker-script.workflow.js'

type UploadPayload = WorkerScriptUploadWorkerModuleRequestFormData | string
type UploadFormBody = Schema.Schema.Type<typeof WorkerUploadBody>

const badRequest = (code: number, message: string): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(failureEnvelope({ code, message }), { status: 400 })

const formOf = (payload: UploadPayload): Option.Option<UploadFormBody> =>
  Schema.decodeUnknownOption(WorkerUploadBody)(payload)

const partsOf = (form: UploadFormBody): ReadonlyArray<WorkerUploadPart> =>
  Array.flatten(
    Array.getSomes(
      Array.map(
        Object.entries(form),
        ([key, value]) =>
          Match.value(key).pipe(
            Match.when('metadata', () => Option.none<ReadonlyArray<WorkerUploadPart>>()),
            Match.orElse(() => Schema.decodeUnknownOption(WorkerUploadParts)(value)),
          ),
      ),
    ),
  )

const readModules = (
  parts: ReadonlyArray<WorkerUploadPart>,
): Effect.Effect<ReadonlyArray<WorkerModuleType>, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* Effect.forEach(parts, (part) =>
      Effect.map(fs.readFileString(part.path), (content) =>
        WorkerModule.make({ content, contentType: part.contentType, name: part.name }))).pipe(Effect.orDie)
  })

const etagOf = (content: WorkerScriptContent) =>
  Effect.gen(function*() {
    const text = yield* Schema.encodeEffect(Schema.fromJsonString(WorkerScriptContent))(content).pipe(
      Effect.orDie,
    )
    const digest = yield* Effect.promise(() =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
    return new Uint8Array(digest).reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
  })

const entryPointOf = (metadata: WorkerUploadMetadata, modules: ReadonlyArray<WorkerModuleType>): string =>
  Option.getOrElse(
    Option.firstSomeOf([
      Option.fromUndefinedOr(metadata.main_module),
      Option.fromUndefinedOr(metadata.body_part),
      Option.map(Array.head(modules), (module) => module.name),
    ]),
    () => '',
  )

const metadataOf = (form: UploadFormBody): WorkerUploadMetadata =>
  Option.getOrElse(
    Option.map(Schema.decodeUnknownOption(WorkerUploadForm)(form), (upload) => upload.metadata),
    (): WorkerUploadMetadata => ({}),
  )

const decide = (
  input: { readonly now: string; readonly newId: string; readonly state: EmulatorState },
  request: WorkerScriptRequest,
): Settled<WorkerScriptState> => {
  const outcome = Result.getOrThrow(
    workerScript(WorkerScriptCommand.make({ now: input.now, state: input.state.workerScripts, request })),
  )
  return { product: outcome.state, status: outcome.status, body: outcome.body }
}

const apply = (operation: string, isWrite: boolean, request: WorkerScriptRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<WorkerScriptState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, workerScripts: product }),
      decide: (input) => decide(input, request),
    })
  })

const applyUploadForm = (scriptName: string, form: UploadFormBody) =>
  Effect.gen(function*() {
    const modules = yield* readModules(partsOf(form))
    const metadata = metadataOf(form)
    const etag = yield* etagOf({ metadata, modules })
    return yield* apply(
      'workerScriptUploadWorkerModule',
      true,
      UploadWorkerScript.make({
        entry_point: entryPointOf(metadata, modules),
        etag,
        metadata,
        modules,
        script_name: scriptName,
      }),
    )
  })

const applyUpload = (scriptName: string, payload: UploadPayload) =>
  Match.value(formOf(payload)).pipe(
    Match.tags({
      None: () => Effect.succeed(badRequest(10021, 'workers.api.error.invalid_upload_body')),
      Some: (form) => applyUploadForm(scriptName, form.value),
    }),
    Match.exhaustive,
  )

const applySettingsPatch = (scriptName: string, payload: WorkerScriptSettingsPatchSettingsRequestJson) =>
  Match.value(Schema.decodeUnknownOption(WorkerSettingsPatch)(payload)).pipe(
    Match.tags({
      None: () => Effect.succeed(badRequest(10021, 'workers.api.error.invalid_script_settings')),
      Some: (settings) =>
        apply(
          'workerScriptSettingsPatchSettings',
          true,
          PatchWorkerScriptSettingsItem.make({
            logpush: settings.value.logpush,
            observability: settings.value.observability,
            script_name: scriptName,
            tags: settings.value.tags,
            tail_consumers: settings.value.tail_consumers,
          }),
        ),
    }),
    Match.exhaustive,
  )

export const workersScriptHandlers = HttpApiBuilder.group(CloudflareApi, 'Worker Script', (handlers) =>
  handlers
    .handle('workerScriptListWorkers', () => apply('workerScriptListWorkers', false, ListWorkerScripts.make({})))
    .handle('workerScriptUploadWorkerModule', ({ params, payload }) =>
      applyUpload(params.script_name, payload))
    .handle('workerScriptDeleteWorker', ({ params, query }) =>
      apply(
        'workerScriptDeleteWorker',
        true,
        DeleteWorkerScript.make({ force: query.force, script_name: params.script_name }),
      ))
    .handle('workerScriptGetSettings', ({ params }) =>
      apply('workerScriptGetSettings', false, GetWorkerScriptSettings.make({ script_name: params.script_name })))
    .handle('workerScriptSettingsGetSettings', ({ params }) =>
      apply(
        'workerScriptSettingsGetSettings',
        false,
        GetWorkerScriptSettingsItem.make({ script_name: params.script_name }),
      ))
    .handle('workerScriptSettingsPatchSettings', ({ params, payload }) =>
      applySettingsPatch(params.script_name, payload))
    .handle('workerScriptGetSubdomain', ({ params }) =>
      apply(
        'workerScriptGetSubdomain',
        false,
        GetWorkerScriptSubdomain.make({ script_name: params.script_name }),
      ))
    .handle('workerScriptPostSubdomain', ({ params, payload }) =>
      apply(
        'workerScriptPostSubdomain',
        true,
        PostWorkerScriptSubdomain.make({
          enabled: payload.enabled,
          previews_enabled: payload.previews_enabled,
          script_name: params.script_name,
        }),
      )))
