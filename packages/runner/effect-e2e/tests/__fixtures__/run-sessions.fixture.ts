import { decodeConfig, defineConfig, type E2EConfig, type Target } from '@systemfsoftware/effect-e2e'
import {
  CacheStorageFailed,
  CacheStore,
  type KeyDigest,
  MemoryCacheStore,
  type StoreMode,
  TraceEntry,
} from '@systemfsoftware/effect-e2e/cache'
import { Engine, type EngineShape, EnvironmentUnavailable, type MemorySite } from '@systemfsoftware/effect-e2e/engine'
import { type ModelAnswer, ModelGateway, type ModelRequest } from '@systemfsoftware/effect-e2e/model'
import {
  type AttemptLog,
  type EngineSource,
  makeAttemptLog,
  type SessionInput,
  TestSession,
  type TestSessionShape,
} from '@systemfsoftware/effect-e2e/run'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import type * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'

import { ORIGIN, scriptedGateway } from './agent-sites.fixture.js'

const KEY_FIELDS = TraceEntry.fields.keyedBy.fields

const IDENTITY: EngineSource['identity'] = { adapter: 'memory', kind: 'web' }

const decodedConfig = (mode: StoreMode): Effect.Effect<E2EConfig> =>
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
    }),
    { ci: false, projectId: 'run-engine', cores: 1 },
  ))

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

export interface World {
  readonly config: E2EConfig
  readonly log: AttemptLog
  readonly gateway: Layer.Layer<ModelGateway>
  readonly requests: Effect.Effect<ReadonlyArray<ModelRequest>>
  readonly drained: Effect.Effect<void>
  readonly store: ObservedStore
}

/** A suite config in `mode`, an empty attempt log, a scripted model and an observed memory store. */
export const worldOf = (input: {
  readonly mode: StoreMode
  readonly answers: ReadonlyArray<ModelAnswer>
  readonly seed?: ReadonlyArray<readonly [KeyDigest, TraceEntry]> | undefined
  readonly failingStore?: boolean
}): Effect.Effect<World> =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(input.answers)
    const drained = yield* Deferred.make<void>()
    const inner = yield* Effect.provide(Effect.service(ModelGateway), scripted.layer)
    const signalled = Effect.flatMap(scripted.requests, (seen) =>
      Effect.when(Deferred.succeed(drained, undefined), Effect.succeed(seen.length === input.answers.length)))
    return {
      config: yield* decodedConfig(input.mode),
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
    }
  })

export interface TryRequest<A, E> {
  readonly world: World
  readonly retry: number
  readonly engine: EngineSource
  readonly secrets?: Readonly<Record<string, Redacted.Redacted<string>>>
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
    test: TEST,
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
        Layer.provide(Layer.merge(request.world.gateway, request.world.store.layer)),
      ),
    ),
  )
