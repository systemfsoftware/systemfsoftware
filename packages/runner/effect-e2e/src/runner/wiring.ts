import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import type * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Record from 'effect/Record'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'

import * as MemoryCacheStore from '../cache/cache-store.memory.js'
import * as FileCacheStore from '../cache/file-cache-store.js'
import type { EngineIdentity } from '../cache/key.schema.js'
import { ConfigInvalid } from '../Config/config-invalid.schema.js'
import type { AgentConfig, ConfigDefaults, E2EConfig, E2EConfigInput, Target } from '../Config/config.schema.js'
import { decodeConfig } from '../Config/decode.js'
import { Engine } from '../engine/engine.service.js'
import * as OpenAiCompatible from '../model/openai-compatible.js'
import { buildReport } from '../report/build.js'
import { type Attempt, RunId } from '../report/report.schema.js'
import { renderJson } from '../report/reporters/json.js'
import type { PlatformAdmission, TestPlatform } from '../run/admit-platforms.workflow.js'
import { admitTest, type AttemptLog, type AttemptTest, makeAttemptLog } from '../run/attempt.js'
import type { TryEnding } from '../run/conclude-attempt.workflow.js'
import * as FileArtifactStore from '../run/file-artifact-store.js'
import { type EngineSource, type SessionInput, TestSession } from '../run/test-session.service.js'
import type { EnvironmentUnavailable } from '../verdict/failure.schema.js'
import { makeTryBinding, type TryBinding } from './fixtures.js'

/** The platform services the core reaches the world through; a Node suite passes `NodeServices` and `NodeHttpClient`. */
export type PlatformLayer = Layer.Layer<FileSystem.FileSystem | Path.Path | HttpClient.HttpClient>

/** One engine adapter as the composition root loads it, keyed by the adapter an `EngineSpec` names. */
export interface EngineBinding {
  readonly identity: EngineIdentity
  readonly version: string
  readonly layer: Layer.Layer<Engine, EnvironmentUnavailable>
}

/**
 * What the suite's composition root (its generated `runner.ts`, design §2.1) hands the core: the platform and
 * engine layers, the environment secrets and the API key are read from, the config defaults the core cannot read
 * itself, and the framework version recordings name.
 */
export interface RunnerOptions {
  readonly platform: PlatformLayer
  readonly engines: Readonly<Record<string, EngineBinding>>
  readonly env: Readonly<Record<string, string | undefined>>
  readonly defaults: ConfigDefaults
  readonly version: string
}

/** A decoded config resolved against the composition root, for one Vitest runner instance. */
export interface Wiring {
  readonly config: E2EConfig
  readonly target: Target
  readonly agent: AgentConfig
  readonly engine: EngineBinding
  readonly options: RunnerOptions
  readonly root: string
  readonly log: AttemptLog
  readonly runId: RunId
  readonly startedAt: DateTime.Utc
}

/** A try in flight: the binding its test body reads, and the scope its session and engine live in. */
export interface OpenTry {
  readonly binding: TryBinding
  readonly scope: Scope.Closeable
}

const DEFAULT_AGENT = 'default'

const required = <A>(value: Option.Option<A>, refusal: () => ConfigInvalid): Result.Result<A, ConfigInvalid> =>
  Option.match(value, { onNone: () => Result.fail(refusal()), onSome: Result.succeed })

const agentOf = (config: E2EConfig): Result.Result<AgentConfig, ConfigInvalid> =>
  required(
    Record.get(config.agents, DEFAULT_AGENT),
    () => new ConfigInvalid({ path: ['agents', DEFAULT_AGENT], expected: `an agent named "${DEFAULT_AGENT}"` }),
  )

const engineOf = (config: E2EConfig, options: RunnerOptions): Result.Result<EngineBinding, ConfigInvalid> =>
  required(
    Record.get(options.engines, config.targets[0].engine.adapter),
    () =>
      new ConfigInvalid({
        path: ['targets', 0, 'engine', 'adapter'],
        expected: `an adapter the suite's runner.ts binds (${Object.keys(options.engines).join(', ')})`,
      }),
  )

const decodedOf = (value: E2EConfigInput, defaults: ConfigDefaults): Result.Result<E2EConfig, ConfigInvalid> =>
  decodeConfig(value, defaults).pipe(Effect.result, Effect.runSync)

const wiringFor = (
  config: E2EConfig,
  request: { readonly options: RunnerOptions; readonly root: string },
): Result.Result<Wiring, ConfigInvalid> =>
  Result.flatMap(agentOf(config), (agent) =>
    Result.map(engineOf(config, request.options), (engine): Wiring => ({
      config,
      target: config.targets[0],
      agent,
      engine,
      options: request.options,
      root: request.root,
      log: Effect.runSync(makeAttemptLog),
      runId: RunId.make(`${config.projectId}-${globalThis.crypto.randomUUID()}`),
      startedAt: Effect.runSync(DateTime.now),
    })))

/**
 * Decodes the suite config once for a runner instance and resolves it against the composition root. A refusal is
 * the `CONFIG_INVALID` every test of the run fails with, before any engine is built (requirements AC-12.4).
 */
export const wiringOf = (request: {
  readonly config: E2EConfigInput
  readonly options: RunnerOptions
  readonly root: string
}): Result.Result<Wiring, ConfigInvalid> =>
  Result.flatMap(decodedOf(request.config, request.options.defaults), (config) => wiringFor(config, request))

export const admitOf = (request: {
  readonly wiring: Wiring
  readonly test: AttemptTest
  readonly platforms: ReadonlyArray<TestPlatform> | undefined
}): Effect.Effect<PlatformAdmission> =>
  admitTest({
    log: request.wiring.log,
    test: request.test,
    target: request.wiring.target,
    agent: DEFAULT_AGENT,
    platforms: request.platforms,
  })

const envOf = (wiring: Wiring, name: string): Option.Option<Redacted.Redacted<string>> =>
  Option.map(Option.fromNullishOr(wiring.options.env[name]), (value) => Redacted.make(value))

const secretsOf = (wiring: Wiring): Readonly<Record<string, Redacted.Redacted<string>>> =>
  Record.getSomes(Record.map(wiring.config.secrets, (secret) => envOf(wiring, secret.env)))

const cacheOf = (wiring: Wiring) =>
  Match.value(wiring.config.cache.mode).pipe(
    Match.when('off', () => MemoryCacheStore.layer({ mode: 'read-only' })),
    Match.orElse((mode) =>
      Layer.unwrap(
        Effect.map(
          Path.Path,
          (path) => FileCacheStore.layer({ directory: path.join(wiring.root, wiring.config.output, 'cache'), mode }),
        ),
      )
    ),
  )

const servicesOf = (wiring: Wiring) =>
  Layer.mergeAll(
    OpenAiCompatible.layer({ model: wiring.agent.model, apiKey: envOf(wiring, wiring.agent.model.apiKeyEnv) }),
    cacheOf(wiring),
    FileArtifactStore.layer({ root: wiring.root, output: wiring.config.output }),
  ).pipe(Layer.provide(wiring.options.platform))

const engineSourceOf = (binding: EngineBinding, scope: Scope.Scope): EngineSource => ({
  identity: binding.identity,
  version: binding.version,
  acquire: Effect.map(Layer.buildWithScope(binding.layer, scope), Context.get(Engine)),
})

const sessionInputOf = (
  wiring: Wiring,
  request: { readonly test: AttemptTest; readonly retry: number; readonly engine: EngineSource },
): SessionInput => ({
  config: wiring.config,
  target: wiring.target,
  agent: { name: DEFAULT_AGENT, config: wiring.agent },
  test: request.test,
  retry: request.retry,
  secrets: secretsOf(wiring),
  engine: request.engine,
  version: wiring.options.version,
  log: wiring.log,
})

export const openTry = (request: {
  readonly wiring: Wiring
  readonly test: AttemptTest
  readonly retry: number
}): Effect.Effect<OpenTry> =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const { wiring } = request
    const input = sessionInputOf(wiring, { ...request, engine: engineSourceOf(wiring.engine, scope) })
    const context = yield* Layer.buildWithScope(
      TestSession.layer(input).pipe(Layer.provide(servicesOf(wiring))),
      scope,
    )
    return { binding: makeTryBinding(Context.get(context, TestSession)), scope }
  })

export const endTry = (request: { readonly open: OpenTry; readonly ending: TryEnding }): Effect.Effect<Attempt> =>
  request.open.binding.session.endAttempt(request.ending).pipe(
    Effect.ensuring(Scope.close(request.open.scope, Exit.void)),
  )

/**
 * Writes the runner instance's `Report1` fragment to `<output>/partials/<run id>.json` (design §7.3) and returns
 * its suite-relative path. The id is unique per runner instance, so workers sharing one process cannot collide.
 */
export const writePartial = (wiring: Wiring) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    const report = buildReport({
      run: {
        id: wiring.runId,
        project: wiring.config.projectId,
        startedAt: wiring.startedAt,
        finishedAt: yield* DateTime.now,
        errors: [],
      },
      entries: yield* wiring.log.entries,
    })
    const relative = path.join(wiring.config.output, 'partials', `${wiring.runId}.json`)
    const absolute = path.join(wiring.root, relative)
    yield* fs.makeDirectory(path.dirname(absolute), { recursive: true })
    yield* fs.writeFileString(absolute, yield* renderJson(report))
    return relative
  }).pipe(Effect.provide(wiring.options.platform))
