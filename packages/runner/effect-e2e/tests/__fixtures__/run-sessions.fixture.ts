import { decodeConfig, defineConfig, type E2EConfig, type Target } from '@systemfsoftware/effect-e2e'
import {
  CacheStorageFailed,
  CacheStore,
  type KeyDigest,
  MemoryCacheStore,
  type StoreMode,
  TraceEntry,
} from '@systemfsoftware/effect-e2e/cache'
import {
  ArtifactWriteFailed,
  Engine,
  type EngineShape,
  EnvironmentUnavailable,
  type MemorySite,
} from '@systemfsoftware/effect-e2e/engine'
import { type ModelAnswer, ModelGateway, type ModelRequest } from '@systemfsoftware/effect-e2e/model'
import {
  ArtifactStore,
  type ArtifactStoreShape,
  type AttemptLog,
  type AttemptTest,
  type EngineSource,
  makeAttemptLog,
  MemoryArtifactStore,
  type SessionInput,
  TestSession,
  type TestSessionShape,
} from '@systemfsoftware/effect-e2e/run'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import type * as Option from 'effect/Option'
import type * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'

import { ORIGIN, scriptedGateway } from './agent-sites.fixture.js'

const KEY_FIELDS = TraceEntry.fields.keyedBy.fields

const IDENTITY: EngineSource['identity'] = { adapter: 'memory', kind: 'web' }

type TraceSetting = E2EConfig['trace']

const decodedConfig = (mode: StoreMode, trace: TraceSetting): Effect.Effect<E2EConfig> =>
  Effect.orDie(decodeConfig(
    defineConfig({
      projectId: 'run-engine',
      targets: [{
        name: 'web',
        engine: { _tag: 'WebEngine', adapter: '@systemfsoftware/effect-e2e-web', browser: 'chromium' },
        app: { url: ORIGIN, identity: 'greet-app' },
      }],
      agents: {
        default: {
          model: { gateway: 'openrouter', model: 'deepseek/deepseek-flash-latest', apiKeyEnv: 'OPENROUTER_API_KEY' },
          context: 'You test the greeting app.',
        },
      },
      cache: { mode },
      trace,
    }),
    { ci: false, projectId: 'run-engine', cores: 1 },
  ))

/** Where a fixture try's evidence goes: a store and a way to read back what it holds by suite-relative path. */
export interface ObservedArtifacts {
  readonly store: ArtifactStoreShape
  readonly read: (path: string) => Effect.Effect<Option.Option<Uint8Array>>
}

const refusingArtifacts: ObservedArtifacts = {
  store: {
    put: (artifact) =>
      Effect.fail(
        new ArtifactWriteFailed({
          message: `the evidence store refuses ${artifact.kind}`,
          evidence: [{ _tag: 'LogEvidence', text: artifact.kind }],
        }),
      ),
  },
  read: () => Effect.succeedNone,
}

const memoryArtifacts: Effect.Effect<ObservedArtifacts> = Effect.map(
  MemoryArtifactStore.make({ output: '.e2e' }),
  (store) => ({ store, read: store.read }),
)

export interface CountedEngine {
  readonly source: EngineSource
  readonly acquisitions: Effect.Effect<number>
  readonly closes: Effect.Effect<number>
}

const memoryEngineOf = (site: MemorySite): Effect.Effect<EngineShape> =>
  Effect.provide(Effect.service(Engine), Engine.layerTest(site))

const counted = (closes: Ref.Ref<number>) => (engine: EngineShape): EngineShape => ({
  ...engine,
  close: Effect.andThen(engine.close, Ref.update(closes, (n) => n + 1)),
})

/** An engine source over the memory engine that counts how often a session opens and closes it. */
export const countedEngine = (site: MemorySite): Effect.Effect<CountedEngine> =>
  Effect.gen(function*() {
    const acquisitions = yield* Ref.make(0)
    const closes = yield* Ref.make(0)
    return {
      source: {
        identity: IDENTITY,
        version: '0.0.0',
        acquire: Effect.andThen(Ref.update(acquisitions, (n) => n + 1), memoryEngineOf(site)).pipe(
          Effect.map(counted(closes)),
        ),
      },
      acquisitions: Ref.get(acquisitions),
      closes: Ref.get(closes),
    }
  })

type ScreenshotRequest = Parameters<EngineShape['screenshot']>[0]

export interface CapturingEngine extends CountedEngine {
  readonly screenshots: Effect.Effect<ReadonlyArray<ScreenshotRequest>>
  readonly asked: Effect.Effect<void>
}

interface Capture {
  readonly requests: Ref.Ref<ReadonlyArray<ScreenshotRequest>>
  readonly asked: Deferred.Deferred<void>
  readonly hangs: boolean
}

const capturing = (capture: Capture) => (engine: EngineShape): EngineShape => ({
  ...engine,
  screenshot: (request) =>
    Ref.update(capture.requests, (all) => [...all, request]).pipe(
      Effect.andThen(Deferred.succeed(capture.asked, undefined)),
      Effect.andThen(capture.hangs ? Effect.never : engine.screenshot(request)),
    ),
})

export const capturingEngine = (input: {
  readonly site: MemorySite
  readonly hangs?: boolean
}): Effect.Effect<CapturingEngine> =>
  Effect.gen(function*() {
    const counted = yield* countedEngine(input.site)
    const capture: Capture = {
      requests: yield* Ref.make<ReadonlyArray<ScreenshotRequest>>([]),
      asked: yield* Deferred.make<void>(),
      hangs: input.hangs ?? false,
    }
    return {
      ...counted,
      source: { ...counted.source, acquire: Effect.map(counted.source.acquire, capturing(capture)) },
      screenshots: Ref.get(capture.requests),
      asked: Deferred.await(capture.asked),
    }
  })

/** An engine source whose environment is down: every acquisition fails `ENVIRONMENT_UNAVAILABLE`. */
export const unavailableEngine: Effect.Effect<CountedEngine> = Effect.map(Ref.make(0), (acquisitions) => ({
  source: {
    identity: IDENTITY,
    version: '0.0.0',
    acquire: Effect.andThen(
      Ref.update(acquisitions, (n) => n + 1),
      Effect.fail(
        new EnvironmentUnavailable({
          message: 'the browser binary is missing',
          evidence: [{ _tag: 'LogEvidence', text: 'spawn chrome ENOENT' }],
        }),
      ),
    ),
  },
  acquisitions: Ref.get(acquisitions),
  closes: Effect.succeed(0),
}))

export interface ObservedStore {
  readonly layer: Layer.Layer<CacheStore>
  readonly digests: Effect.Effect<ReadonlyArray<KeyDigest>>
}

const refused = Effect.fail(new CacheStorageFailed({ message: 'the disk is full' }))

/**
 * A memory store that also keeps the digests it holds, so a scenario reads what the end wrote and
 * deleted; `seed` is written before the try, and `failing` then refuses every write and delete.
 */
export const observedStore = (input: {
  readonly mode: StoreMode
  readonly seed: ReadonlyArray<readonly [KeyDigest, TraceEntry]>
  readonly failing: boolean
}): Effect.Effect<ObservedStore> =>
  Effect.gen(function*() {
    const inner = yield* MemoryCacheStore.make({ mode: input.mode })
    const held = yield* Ref.make(HashSet.empty<KeyDigest>())
    const healthy = CacheStore.of({
      writable: inner.writable,
      read: inner.read,
      write: (digest, entry) =>
        Effect.tap(inner.write(digest, entry), (answer) =>
          Match.valueTags(answer, {
            Written: () => Ref.update(held, HashSet.add(digest)),
            ReadOnly: () => Effect.void,
            Oversized: () => Effect.void,
          })),
      delete: (digest) =>
        Effect.tap(inner.delete(digest), (answer) =>
          Match.valueTags(answer, {
            Deleted: () => Ref.update(held, HashSet.remove(digest)),
            ReadOnly: () => Effect.void,
          })),
    })
    yield* Effect.orDie(
      Effect.forEach(input.seed, ([digest, entry]) => healthy.write(digest, entry), { discard: true }),
    )
    const broken = CacheStore.of({ ...healthy, write: () => refused, delete: () => refused })
    return {
      layer: Layer.succeed(CacheStore, input.failing ? broken : healthy),
      digests: Effect.map(Ref.get(held), (digests) => [...digests].toSorted()),
    }
  })

export interface Hanging {
  readonly layer: Layer.Layer<ModelGateway>
  /** Completes when the model is first asked, so a body can return while the step waits on it. */
  readonly asked: Effect.Effect<void>
}

/** A gateway that never answers and signals the first request it sees. */
export const hangingGateway: Effect.Effect<Hanging> = Effect.map(Deferred.make<void>(), (asked) => ({
  layer: Layer.succeed(
    ModelGateway,
    ModelGateway.of({ complete: () => Effect.andThen(Deferred.succeed(asked, undefined), Effect.never) }),
  ),
  asked: Deferred.await(asked),
}))

export const TEST = {
  id: KEY_FIELDS.test.make('tests/greet.e2e.ts > greets'),
  title: 'greets',
  file: 'tests/greet.e2e.ts',
} as const

export const GREETING_SCHEMA = Schema.Struct({ greeting: Schema.String }).pipe(
  Schema.toStandardSchemaV1,
  Schema.toStandardJSONSchemaV1,
)

export const EXTRACTS_GREETING: ModelAnswer = {
  _tag: 'ToolCalls',
  calls: [{ id: 'call-extracted', name: 'extracted', arguments: { value: { greeting: 'Hello, Ada' } } }],
}

export interface World {
  readonly config: E2EConfig
  readonly log: AttemptLog
  readonly gateway: Layer.Layer<ModelGateway>
  readonly requests: Effect.Effect<ReadonlyArray<ModelRequest>>
  readonly drained: Effect.Effect<void>
  readonly store: ObservedStore
  readonly artifacts: ObservedArtifacts
}

/**
 * A suite config in `mode` (evidence kept on failure unless `trace` says otherwise), an empty attempt log, a scripted
 * model, an observed memory store and a memory evidence store, or one that refuses every write.
 */
export const worldOf = (input: {
  readonly mode: StoreMode
  readonly answers: ReadonlyArray<ModelAnswer>
  readonly seed?: ReadonlyArray<readonly [KeyDigest, TraceEntry]> | undefined
  readonly failingStore?: boolean
  readonly trace?: TraceSetting
  readonly refusingArtifacts?: boolean
}): Effect.Effect<World> =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(input.answers)
    const drained = yield* Deferred.make<void>()
    const inner = yield* Effect.provide(Effect.service(ModelGateway), scripted.layer)
    const signalled = Effect.flatMap(scripted.requests, (seen) =>
      Effect.when(Deferred.succeed(drained, undefined), Effect.succeed(seen.length === input.answers.length)))
    return {
      config: yield* decodedConfig(input.mode, input.trace ?? 'retain-on-failure'),
      log: yield* makeAttemptLog,
      gateway: Layer.succeed(
        ModelGateway,
        ModelGateway.of({
          complete: (request) =>
            Effect.tap(inner.complete(request), () => signalled),
        }),
      ),
      requests: scripted.requests,
      drained: Deferred.await(drained),
      store: yield* observedStore({
        mode: input.mode,
        seed: input.seed ?? [],
        failing: input.failingStore ?? false,
      }),
      artifacts: input.refusingArtifacts === true ? refusingArtifacts : yield* memoryArtifacts,
    }
  })

export interface TryRequest<A, E> {
  readonly world: World
  readonly retry: number
  readonly engine: EngineSource
  readonly secrets?: Readonly<Record<string, Redacted.Redacted<string>>>
  readonly test?: AttemptTest
  readonly body: (session: TestSessionShape) => Effect.Effect<A, E, Scope.Scope>
}

export const targetOf = (world: World): Target => {
  const target = world.config.targets[0]
  if (target === undefined) throw new Error('the fixture config names one target')
  return target
}

const sessionInputOf = <A, E>(request: TryRequest<A, E>): SessionInput => {
  const target = targetOf(request.world)
  const agent = request.world.config.agents['default']
  if (agent === undefined) throw new Error('the fixture config names one agent')
  return {
    config: request.world.config,
    target,
    agent: { name: 'default', config: agent },
    test: request.test ?? TEST,
    retry: request.retry,
    secrets: request.secrets ?? {},
    engine: request.engine,
    version: '0.0.0-test',
    log: request.world.log,
  }
}

/** Runs `body` as one try in its own scope, the way the runner edge will, and returns the body's value. */
export const inTry = <A, E>(request: TryRequest<A, E>): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.provide(
      Effect.gen(function*() {
        return yield* request.body(yield* TestSession)
      }),
      TestSession.layer(sessionInputOf(request)).pipe(
        Layer.provide(
          Layer.mergeAll(
            request.world.gateway,
            request.world.store.layer,
            Layer.succeed(ArtifactStore, request.world.artifacts.store),
          ),
        ),
      ),
    ),
  )
