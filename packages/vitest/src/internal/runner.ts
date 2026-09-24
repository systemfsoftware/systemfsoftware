/// <reference types="node" />
/**
 * The fork's runner: the test lanes, the layer blocks, the property lanes and the run pipeline.
 *
 * A test body is a generator the driver steps (KTD1), so `expect` is the body's own parameter and every check is
 * yielded. Everything #512 promised holds unchanged: a fresh build of a test's layers, virtual time that advances
 * when the fibers are idle, concurrent and shuffled blocks, a declared-shared block as the only sharing, a second
 * run on a fresh build that reports leaked state, and Effect `Equal` in `toEqual`.
 *
 * What is a refusal here: a body that is not a generator, and the habit lanes `it.effect`, `it.scoped` and
 * `it.scopedLive` (R2, R9). Registration marks every task this file adds (KTD8), so the guard in
 * `@effect/vitest/guard` can tell the fork's tests from a test registered by Vitest itself.
 */
import * as Cause from 'effect/Cause'
import type * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Function from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import type * as Scheduler from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import * as TestClock from 'effect/testing/TestClock'
import * as TestConsole from 'effect/testing/TestConsole'
import * as V from 'vitest'
import type * as Vitest from '../mod.js'
import { type Checks, checksFor, type Ledger, makeLedger } from './checks.js'
import { type Body, drive } from './driver.js'
import { registerEqualTester } from './equal.js'
import * as Refusals from './errors.schema.js'
import { markTask } from './guard.js'
import { makeProperty, type PropertyRuntime } from './property/engine.js'
import {
  type HookRefusal,
  isRefusal as isRefusalError,
  refusalOf as refusalError,
  refuseAsyncBody,
  refuseEffectLane,
  refuseHook,
  refuseScopedLane,
  refuseScopedLiveLane,
  refuseSyncBody,
  unprovidedText,
} from './refusals.js'
import { VitestTestContext } from './test-context.js'
import { makeVirtualRuntime, virtualClockLayer, type VirtualRuntime } from './virtual-time.js'

const getCurrentSuite = V.TestRunner.getCurrentSuite

/** @internal */
export const addEqualityTesters = (): void => {
  registerEqualTester()
}

const numbered = (timeout: number): V.TestOptions => ({ timeout })

const givenOptions = (timeout?: V.TestOptions): V.TestOptions => timeout ?? {}

/** @internal */
export const testOptions = (timeout?: number | V.TestOptions): V.TestOptions =>
  typeof timeout === 'number' ? numbered(timeout) : givenOptions(timeout)

/** @internal */
export const hookTimeout = (timeout?: Duration.Input): number | undefined =>
  timeout === undefined ? undefined : Duration.toMillis(Duration.fromInputUnsafe(timeout))

type Timeout = number | V.TestOptions

/** The registration of one test: Vitest's own `it`, one of its modifiers, or `it.for`. */
type Registrar = (name: string, options: V.TestOptions, body: V.TestFunction<object>) => void

const isName = (first: unknown): first is string => typeof first === 'string'

const byName = (args: IArguments): boolean => isName(args[0])

const byLayer = (args: IArguments): boolean => Layer.isLayer(args[0])

const byEffect = (args: IArguments): boolean => Effect.isEffect(args[0])

/**
 * The positional property form is refused at run time with the R15 rewrite; the public type refuses it first
 * because a `PropertySpec` is an object and the positional shape is not.
 */
const refusePositionalProp =
  '✗ it.prop(name, [arbitraries], predicate) is removed. Name the function under test and pass a budget: ' +
  'it.prop(name, { of, subject, runs }, holds).'

const isAbsent = (spec: object | null | undefined): spec is null | undefined => spec === null || spec === undefined

const hasNoOf = (spec: object): boolean => Object.hasOwn(spec, 'of') === false

const lacksInputs = (spec: object | null | undefined): boolean => isAbsent(spec) || hasNoOf(spec)

const refusePositional = (spec: object | null | undefined): void => {
  if (lacksInputs(spec)) throw new Refusals.Slop({ detail: refusePositionalProp })
}

/** @internal */
export interface RunEnv {
  readonly runtime: VirtualRuntime | undefined
  readonly owned: boolean
}

/** @internal */
export const realTime: RunEnv = { runtime: undefined, owned: false }

/**
 * A run with its own virtual clock: the clock only ever advances when the run's fibers are idle.
 *
 * @internal
 */
export const perRun = (): RunEnv => ({ runtime: makeVirtualRuntime(), owned: true })

const propertyEnv: RunEnv = realTime

const logErrors = <E>(cause: Cause.Cause<E>): Effect.Effect<void, never, never> =>
  Effect.forEach(Cause.prettyErrors(cause), (error) => Effect.logError(error), { discard: true })

const signalOf = (ctx: V.TestContext | undefined): AbortSignal | undefined => ctx?.signal

const signalOnly = (signal: AbortSignal | undefined): { readonly signal?: AbortSignal } =>
  signal === undefined ? {} : { signal }

const schedulerOf = (env: RunEnv): { readonly scheduler?: Scheduler.Scheduler } =>
  env.runtime === undefined ? {} : { scheduler: env.runtime.scheduler }

const runOptions = (
  ctx: V.TestContext | undefined,
  env: RunEnv,
): { readonly signal?: AbortSignal; readonly scheduler?: Scheduler.Scheduler } => ({
  ...signalOnly(signalOf(ctx)),
  ...schedulerOf(env),
})

const ownedRuntime = (env: RunEnv): VirtualRuntime | undefined => env.owned === false ? undefined : env.runtime

const observeOf = (runtime: VirtualRuntime | undefined): Effect.Effect<void, never, never> =>
  runtime === undefined ? Effect.void : runtime.observe

const endOf = (runtime: VirtualRuntime | undefined): Effect.Effect<void, never, never> =>
  runtime === undefined ? Effect.void : runtime.end

const wrapOwned = <A, E>(
  effect: Effect.Effect<A, E, never>,
  runtime: VirtualRuntime | undefined,
): Effect.Effect<A, E, never> => observeOf(runtime).pipe(Effect.andThen(effect.pipe(Effect.ensuring(endOf(runtime)))))

const runExit = <A, E>(
  effect: Effect.Effect<A, E, never>,
  ctx: V.TestContext | undefined,
  env: RunEnv,
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(wrapOwned(effect, ownedRuntime(env)), runOptions(ctx, env))

/**
 * A body that needs a service nothing provides dies with Effect's own `Service not found`. That is a
 * test-authoring error — the layers were never wired — so it is reported as the unprovided rewrite (R9) instead
 * of as a raw defect.
 */
const isUnprovided = (error: unknown): error is Error =>
  error instanceof Error && error.message.startsWith('Service not found')

const rethrowSquashed = <E>(cause: Cause.Cause<E>): never => {
  const error = Cause.squash(cause)
  if (isUnprovided(error)) throw new Refusals.Slop({ detail: unprovidedText })
  throw error
}

const failExit = <E>(cause: Cause.Cause<E>): Promise<never> =>
  logErrors(cause).pipe(Effect.runPromise).then(() => rethrowSquashed(cause))

const reportExit = <A, E>(exit: Exit.Exit<A, E>): Promise<A | undefined> =>
  Exit.isSuccess(exit) ? Promise.resolve(exit.value) : failExit(exit.cause)

const runPromise = <A, E>(
  effect: Effect.Effect<A, E, never>,
  ctx?: V.TestContext,
  env: RunEnv = realTime,
): Promise<A | undefined> => runExit(effect, ctx, env).then(reportExit)

const noop = (): void => {}

const detach = (ctx: V.TestContext, onAbort: () => void): void => {
  ctx.signal.removeEventListener('abort', onAbort)
}

const trackAbort = <A>(ctx: V.TestContext, promise: Promise<A>): void => {
  const onAbort = (): void => {
    ctx.onTestFinished(() => promise.then(noop, noop))
  }
  ctx.signal.addEventListener('abort', onAbort, { once: true })
  void promise.then(() => detach(ctx, onAbort), () => detach(ctx, onAbort))
  if (ctx.signal.aborted) onAbort()
}

const runTest = (ctx?: V.TestContext, env: RunEnv = realTime) =>
<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A | undefined> => {
  const promise = runPromise(effect, ctx, env)
  if (ctx !== undefined) trackAbort(ctx, promise)
  return promise
}

const clockLayerOf = (env: RunEnv) => env.runtime === undefined ? TestClock.layer() : virtualClockLayer(env.runtime)

/** @internal */
export const testEnv = (env: RunEnv) => Layer.mergeAll(TestConsole.layer, clockLayerOf(env))

/**
 * The run a test's fibers execute in: the test's own context under the fork's `VitestTestContext`, so a library
 * built on the fork reads the same context the runner does.
 */
const bindRun = <A, E>(effect: Effect.Effect<A, E, never>, ctx: V.TestContext): Effect.Effect<A, E, never> =>
  effect.pipe(Effect.provideService(VitestTestContext, ctx))

/**
 * What a lane does with the program the driver built: the services of the lane and of its block come from here,
 * so the program is fully satisfied and the run reports only the body's own failure.
 */
type MapEffect<R> = <A, E>(self: Effect.Effect<A, E, R>, env: RunEnv) => Effect.Effect<A, E, never>

/**
 * The iterator the driver steps, erased: the driver reads every `next` without knowing what the body yields, and
 * the layer block is where a body's requirements are checked.
 */
type Steps = Iterator<never, never, undefined>

/** A body a lane registered, with this test's checks in hand and its row, if it has any, already applied. */
type LaneBody = (checks: Checks) => object

/** The registration of a lane: the body's shape is what Vitest stores, and the mark is what the guard reads. */
type LaneRegister = <Eff, AEff>(
  name: string,
  body: Vitest.Vitest.Body<Eff, AEff> | Vitest.Vitest.BodyRefusal,
  timeout?: Timeout,
) => void

const refuseBody = (text: string): never => {
  throw refusalError(text)
}

/** The constructor names of the function kinds that hand back a promise instead of a generator. */
const AWAITED_KINDS: Record<string, true> = { AsyncFunction: true, AsyncGeneratorFunction: true }

/** The constructor name of the one function kind the driver steps: a generator hands its steps over. */
const GENERATOR_KIND = 'GeneratorFunction'

const kindOf = (body: object): string => body.constructor.name

const isGeneratorBody = (body: object): boolean => kindOf(body) === GENERATOR_KIND

const isSteps = (returned: object): returned is Steps => 'next' in returned && typeof returned.next === 'function'

/** The iterator a generator handed over; only a generator reaches here, so the guard is for the compiler alone. */
const asSteps = (returned: object): Steps => isSteps(returned) ? returned : refuseBody(refuseSyncBody)

/**
 * The refusal a body reaches before it runs (R2). An `async` body hands back a promise and runs outside the test
 * runtime. A plain body can only be told from one by calling it, and nothing in a refused body may run, so it is
 * refused as a sync body, whose rewrite is to pass a generator; the compile channel prints each shape's own text.
 */
const refusalOf = (body: object): string => AWAITED_KINDS[kindOf(body)] === true ? refuseAsyncBody : refuseSyncBody

/** The body's generator, or the refusal for a body the driver cannot step. */
const stepsOfBody = <Eff, AEff>(body: Vitest.Vitest.Body<Eff, AEff>, checks: Checks): Steps =>
  isGeneratorBody(body) ? asSteps(body(checks)) : refuseBody(refusalOf(body))

/** The same for a row body: Vitest's `it.for` order is the row first, then the checks (R9). */
const stepsOfRow = <Row, Eff, AEff>(
  row: Row,
  body: Vitest.Vitest.RowBody<Row, Eff, AEff>,
  checks: Checks,
): Steps => isGeneratorBody(body) ? asSteps(body(row, checks)) : refuseBody(refusalOf(body))

const bodyOf = (ledger: Ledger, body: LaneBody): Body => () => asSteps(body(checksFor(ledger)))

/** The body a lane registered, closed over its checks: the generator itself, or the refusal for what it is not. */
const laneBodyOf = <Eff, AEff>(
  body: Vitest.Vitest.Body<Eff, AEff> | Vitest.Vitest.BodyRefusal,
): LaneBody =>
(checks) => typeof body === 'string' ? refuseBody(refuseSyncBody) : stepsOfBody(body, checks)

/** The row body a lane registered: Vitest's `it.for` order is the row first, then the checks (R9). */
const rowBodyOf = <Row, Eff, AEff>(
  row: Row,
  body: Vitest.Vitest.RowBody<Row, Eff, AEff> | Vitest.Vitest.BodyRefusal,
): LaneBody =>
(checks) => typeof body === 'string' ? refuseBody(refuseSyncBody) : stepsOfRow(row, body, checks)

/** One test's run: a fresh ledger, and the lane's own services around the program the driver built. */
const runLaned = <R>(
  ctx: V.TestContext,
  mapEffect: MapEffect<R>,
  env: RunEnv,
  body: LaneBody,
): Promise<void> => {
  const ledger = makeLedger(ctx)
  return runTest(ctx, env)(mapEffect(bindRun(drive(bodyOf(ledger, body), [], ledger), ctx), env))
}

const outcomeOf = (promise: Promise<void>): Promise<Error | undefined> =>
  promise.then(() => undefined, (error: Error) => error)

const isSlop = (error: Error): error is Refusals.Slop => Schema.is(Refusals.Slop)(error)

/** Every failure the fork itself names: the branded refusals, plus the Schema-tagged families. */
const otherRefusals: ReadonlyArray<(error: Error) => boolean> = [
  isSlop,
  Schema.is(Refusals.InvalidBudget),
  Schema.is(Refusals.NonBooleanVerdict),
  Schema.is(Refusals.LeakedState),
]

const isRefusal = (error: Error): boolean => isRefusalError(error) || otherRefusals.some((matches) => matches(error))

const clipped = (message: string): string => message.length > 400 ? message.slice(0, 400) : message

const throwLeaked = (outcome: Error): never => {
  throw new Refusals.LeakedState({
    detail: '✗ this test passed, then failed when run again on a fresh build of its services: something keeps state ' +
      "outside its layer, so tests here see each other's changes. The second run failed with: " +
      clipped(outcome.message),
  })
}

/**
 * The second run's failure: a diagnosis the fork itself made is rethrown as that diagnosis, because the second
 * run exists to catch leaked state, not to relabel a refusal as a leak. Anything else is the leak.
 */
const throwSecondRun = (error: Error): never => {
  if (isRefusal(error)) throw error
  return throwLeaked(error)
}

const leakedOrNothing = (error: Error | undefined): void => {
  if (error !== undefined) throwSecondRun(error)
}

const NO_ERRORS: ReadonlyArray<object> = []

const presentErrors = (errors: ReadonlyArray<object> | undefined): ReadonlyArray<object> =>
  errors === undefined ? NO_ERRORS : errors

/** Whether a run left no failure behind: only a clean first run is worth running a second time. */
const isClean = (ctx: V.TestContext): boolean => presentErrors(ctx.task.result?.errors).length === 0

/**
 * Runs a property's program as the test that registered it, under the same context the generator lanes use. The
 * env is the bare `propertyEnv`: a `false` verdict is the property's own shrink path, so nothing interrupts it.
 */
const runProperty = <E>(ctx: V.TestContext, program: () => Effect.Effect<void, E, never>): Promise<void> =>
  runTest(ctx, propertyEnv)(bindRun(Effect.suspend(program), ctx))

/** The sync lane needs nothing provided, and every property test registers on the file's own `it`. */
const syncRuntime: PropertyRuntime<never> = {
  register: (name, program) => marked(() => V.it(name, (ctx) => runProperty(ctx, program))),
  provide: (effect) => effect,
}

const property = makeProperty(syncRuntime)

const propImpl = <const G extends Vitest.Vitest.Gens, S extends Vitest.Vitest.PropertySubject, N extends number>(
  name: string,
  spec: Vitest.Vitest.PropertySpec<G, S, N>,
  holds: (subject: S, values: Vitest.Vitest.Values<G>) => boolean,
): void => {
  refusePositional(spec)
  property.prop(name, spec, holds)
}

/** @internal */
export const prop: Vitest.Vitest.SyncProperty = Function.dual(byName, propImpl)

/**
 * The law kinds over the sync property family: the top-level `it.law`.
 *
 * @internal
 */
export const law = property.law

/**
 * Options for the top-level `layer` and for `it.layer` inside a `Methods` block.
 *
 * @internal
 */
export type LayerOptions = {
  readonly concurrent?: boolean
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
  readonly excludeTestServices?: boolean
  /**
   * Share one build of these layers across every test of the block, instead of giving each test its own fresh
   * build. The only way to share; nested blocks inherit it.
   */
  readonly shared?: boolean
}

type BlockBody<R> = (it: Vitest.Vitest.MethodsNonLive<R>) => void

type BlockName<R> = string | BlockBody<R>

/** @internal */
export type BlockRegistrar<R> = {
  (f: BlockBody<R>): void
  (name: string, f: BlockBody<R>): void
}

/**
 * The nested layer a block's own `it.layer` opens, and the options it accepts.
 *
 * @internal
 */
export type NestedLayer = {
  readonly concurrent?: boolean
  readonly timeout?: Duration.Input
  /** Share one build across this nested block's tests; inherited from a shared parent block. */
  readonly shared?: boolean
}

type NestedLayerRegistrar<R> = {
  <R2, E>(nested: Layer.Layer<R2, E, R>, options?: NestedLayer): BlockRegistrar<R | R2>
  (options?: NestedLayer): <R2, E>(nested: Layer.Layer<R2, E, R>) => BlockRegistrar<R | R2>
}

type BlockRunOptions = {
  readonly concurrent: boolean
  readonly shuffle: boolean
}

const CONCURRENT_BLOCK: BlockRunOptions = { concurrent: true, shuffle: true }

const ALONE_BLOCK: BlockRunOptions = { concurrent: false, shuffle: false }

const withDefault = <A>(given: A | undefined, fallback: A): A => given ?? fallback

const concurrencyIn = (options: LayerOptions | undefined): boolean | undefined => options?.concurrent

const timeoutIn = (options: LayerOptions | undefined): Duration.Input | undefined => options?.timeout

const excludedIn = (options: LayerOptions | undefined): boolean | undefined => options?.excludeTestServices

const sharedIn = (options: LayerOptions | undefined): boolean | undefined => options?.shared

const memoMapIn = (options: LayerOptions | undefined): Layer.MemoMap | undefined => options?.memoMap

const excludeTestServicesOf = (options: LayerOptions | undefined): boolean => withDefault(excludedIn(options), false)

const blockEnvOf = (inherited: RunEnv | undefined): RunEnv =>
  withDefault(inherited, { runtime: makeVirtualRuntime(), owned: false })

const memoMapOf = (options: LayerOptions | undefined): Layer.MemoMap =>
  withDefault(memoMapIn(options), Effect.runSync(Layer.makeMemoMap))

const blockHookTimeout = (options: LayerOptions | undefined): number | undefined => hookTimeout(timeoutIn(options))

const isSharedBlock = (options: LayerOptions | undefined): boolean => sharedIn(options) === true

const mergeBlockOptions = (options: LayerOptions | undefined, fallback: BlockRunOptions): BlockRunOptions => ({
  concurrent: withDefault(concurrencyIn(options), fallback.concurrent),
  shuffle: fallback.shuffle,
})

/**
 * A named block's suite options: its tests run concurrently and in shuffled order (R4). A declared-shared block
 * is the stateful exception — its tests read each other's writes through one build, so it stays in declaration
 * order and runs alone.
 */
const describeOptions = (options: LayerOptions | undefined, shared: boolean): BlockRunOptions =>
  mergeBlockOptions(options, shared ? ALONE_BLOCK : CONCURRENT_BLOCK)

/**
 * The block's layer with the test's own services merged in, unless the block excludes them. `Layer`'s output is
 * contravariant, so the merged layer is the *narrower* `Layer<R, E>` the callers provide to a run.
 */
const mergeTestEnv = <R, E, EnvROut>(
  layer_: Layer.Layer<R, E>,
  env: Layer.Layer<EnvROut, never, never>,
  excludeTestServices: boolean,
): Layer.Layer<R, E> => excludeTestServices ? layer_ : Layer.provideMerge(layer_, env)

const sharedContext = <R, E>(
  shared: Layer.Layer<R, E>,
  memoMap: Layer.MemoMap,
  scope: Scope.Scope,
): Effect.Effect<Context.Context<R>, never, never> =>
  Layer.buildWithMemoMap(shared, memoMap, scope).pipe(Effect.orDie, Effect.cached, Effect.runSync)

const makeScopeCloser = (scope: Scope.Scope): () => Promise<void> => {
  let closed = false
  return () => {
    if (closed) return Promise.resolve()
    closed = true
    return runPromise(Scope.close(scope, Exit.void)).then(noop)
  }
}

/**
 * Opens a block from its arguments: an anonymous body, or a named one. The sole implementation behind both
 * arities, so `layer(L)(fn)` and `layer(L)("name", fn)` cannot drift apart.
 */
const blockOpener = <R>(
  anonymous: (f: BlockBody<R>) => void,
  named: (name: string, f: BlockBody<R>) => void,
): BlockRegistrar<R> =>
(first: BlockName<R>, second?: BlockBody<R>): void => routeBlock(first, second, anonymous, named)

const routeBlock = <R>(
  first: BlockName<R>,
  second: BlockBody<R> | undefined,
  anonymous: (f: BlockBody<R>) => void,
  named: (name: string, f: BlockBody<R>) => void,
): void => {
  if (typeof first === 'string') return openNamed(first, second, named)
  return anonymous(first)
}

const openNamed = <R>(
  name: string,
  f: BlockBody<R> | undefined,
  named: (name: string, f: BlockBody<R>) => void,
): void => {
  if (f !== undefined) named(name, f)
}

/** Runs a registration and marks every test task it added, which is how the guard knows the fork registered it. */
const marked = (register: () => void): void => {
  const before = suiteTasks(getCurrentSuite()).length
  register()
  markAdded(before)
}

const markAdded = (before: number): void => {
  for (const task of collectTasks(suiteTasks(getCurrentSuite()).slice(before))) markTask(task)
}

const blockTasksOf = (): ReadonlyArray<CollectedTask> => suiteTasks(getCurrentSuite())

const suiteTasks = (suite: { readonly tasks: ReadonlyArray<CollectedTask> }): ReadonlyArray<CollectedTask> =>
  suite.tasks

type CollectedTask = {
  readonly type: string
  readonly mode?: string
  readonly tasks?: ReadonlyArray<CollectedTask>
}

const collectTasks = (tasks: ReadonlyArray<CollectedTask>): Array<V.TestContext['task']> => {
  const acc: Array<V.TestContext['task']> = []
  for (const task of tasks) collectOne(task, acc)
  return acc
}

const collectNested = (task: CollectedTask, acc: Array<V.TestContext['task']>): void => {
  if (task.tasks !== undefined) collectTasks(task.tasks).forEach((nested) => acc.push(nested))
}

const collectOne = (task: CollectedTask, acc: Array<V.TestContext['task']>): void => {
  if (isRunnableTest(task)) acc.push(task)
  else collectNested(task, acc)
}

const notSkipped = (task: CollectedTask): boolean => task.mode !== 'skip' && task.mode !== 'todo'

const isRunnableTest = (task: CollectedTask): task is CollectedTask & V.TestContext['task'] =>
  task.type === 'test' && notSkipped(task)

const layerFor = <R, E>(
  layer_: (env: RunEnv) => Layer.Layer<R, E>,
  options: LayerOptions | undefined,
  inherited: RunEnv | undefined,
): BlockRegistrar<R> => isSharedBlock(options) ? sharedBlock(layer_, options, inherited) : freshBlock(layer_, options)

const freshBlock = <R, E>(
  layer_: (env: RunEnv) => Layer.Layer<R, E>,
  options: LayerOptions | undefined,
): BlockRegistrar<R> => {
  const excludeTestServices = excludeTestServicesOf(options)
  const withTestEnv = (env: RunEnv): Layer.Layer<R, E> => mergeTestEnv(layer_(env), testEnv(env), excludeTestServices)
  const nestedOpen = <R2, E2>(
    nestedLayer: Layer.Layer<R2, E2, R>,
    nestedOptions: NestedLayer | undefined,
  ): BlockRegistrar<R | R2> =>
    layerFor((env) => Layer.provideMerge(nestedLayer, withTestEnv(env)), {
      ...nestedOptions,
      excludeTestServices,
    }, undefined)
  const nestedLayer: NestedLayerRegistrar<R> = Function.dual(byLayer, nestedOpen)
  const makeIt = (it: V.TestAPI): Vitest.Vitest.MethodsNonLive<R> =>
    methodsFor<R>(
      (effect, env) =>
        effect.pipe(Effect.scoped, (scoped) => Effect.provide(scoped, Layer.orDie(Layer.fresh(withTestEnv(env))))),
      it,
      perRun,
      true,
      nestedLayer,
    )
  return blockOpener(
    (f) => f(makeIt(V.it)),
    (name, f) => {
      V.describe(name, describeOptions(options, false), () => f(makeIt(V.it)))
    },
  )
}

const nestedBlock = (nested: NestedLayer | undefined, memoMap: Layer.MemoMap): LayerOptions => ({
  ...nested,
  memoMap: Layer.forkMemoMapUnsafe(memoMap),
  shared: true,
})

const sharedBlock = <R, E>(
  layer_: (env: RunEnv) => Layer.Layer<R, E>,
  options: LayerOptions | undefined,
  inherited: RunEnv | undefined,
): BlockRegistrar<R> => {
  const blockEnv = blockEnvOf(inherited)
  const memoMap = memoMapOf(options)
  const scope = Scope.makeUnsafe()
  const shared = mergeTestEnv(layer_(blockEnv), testEnv(blockEnv), excludeTestServicesOf(options))
  const contextEffect = sharedContext(shared, memoMap, scope)
  const nestedOpen = <R2, E2>(
    nestedLayer: Layer.Layer<R2, E2, R>,
    nestedOptions: NestedLayer | undefined,
  ): BlockRegistrar<R | R2> =>
    layerFor(() => Layer.provideMerge(nestedLayer, shared), nestedBlock(nestedOptions, memoMap), blockEnv)
  const nestedLayer: NestedLayerRegistrar<R> = Function.dual(byLayer, nestedOpen)
  const makeIt = (it: V.TestAPI): Vitest.Vitest.MethodsNonLive<R> =>
    methodsFor<R>(
      (effect) =>
        Effect.flatMap(contextEffect, (context) =>
          effect.pipe(
            Effect.scoped,
            (scoped) => Effect.provide(scoped, context),
          )),
      it,
      () => blockEnv,
      false,
      nestedLayer,
    )
  const closeScope = makeScopeCloser(scope)
  return blockOpener(
    (f) => sharedAnonymous(f, makeIt, options, blockTasksOf(), blockEnv, contextEffect, closeScope),
    (name, f) => describeShared(name, f, makeIt, options, contextEffect, closeScope, blockEnv),
  )
}

const describeShared = <R>(
  name: string,
  f: BlockBody<R>,
  makeIt: (it: V.TestAPI) => Vitest.Vitest.MethodsNonLive<R>,
  options: LayerOptions | undefined,
  contextEffect: Effect.Effect<Context.Context<R>, never, never>,
  closeScope: () => Promise<void>,
  blockEnv: RunEnv,
): void => {
  V.describe(name, describeOptions(options, true), () => {
    V.beforeAll(() => runPromise(Effect.asVoid(contextEffect), undefined, blockEnv), blockHookTimeout(options))
    V.afterAll(() => closeScope(), blockHookTimeout(options))
    return f(makeIt(V.it))
  })
}

const sharedAnonymous = <R>(
  register: BlockBody<R>,
  makeIt: (it: V.TestAPI) => Vitest.Vitest.MethodsNonLive<R>,
  options: LayerOptions | undefined,
  blockTasks: ReadonlyArray<CollectedTask>,
  blockEnv: RunEnv,
  contextEffect: Effect.Effect<Context.Context<R>, never, never>,
  closeScope: () => Promise<void>,
): void => {
  const previousTasks = new Set(blockTasks)
  register(makeIt(V.it))
  const added = collectTasks(blockTasksOf().filter((task) => previousTasks.has(task) === false))
  if (added.length === 0) {
    V.afterAll(() => closeScope(), blockHookTimeout(options))
    return
  }
  openAddedTests(added, blockEnv, contextEffect, closeScope, options)
}

const openAddedTests = <R>(
  added: ReadonlyArray<V.TestContext['task']>,
  blockEnv: RunEnv,
  contextEffect: Effect.Effect<Context.Context<R>, never, never>,
  closeScope: () => Promise<void>,
  options: LayerOptions | undefined,
): void => {
  const blockTaskSet = new Set(added)
  V.beforeEach(
    (ctx) => sharedBeforeEach(ctx, blockTaskSet, countDown(added.length, closeScope), contextEffect, blockEnv),
    blockHookTimeout(options),
  )
  V.afterAll(() => closeScope(), blockHookTimeout(options))
}

const countDown = (remaining: number, closeScope: () => Promise<void>): () => Promise<void> | undefined => {
  let left = remaining
  return () => {
    left -= 1
    return left === 0 ? closeScope() : undefined
  }
}

const sharedBeforeEach = <R>(
  ctx: V.TestContext,
  blockTaskSet: ReadonlySet<V.TestContext['task']>,
  finish: () => Promise<void> | undefined,
  contextEffect: Effect.Effect<Context.Context<R>, never, never>,
  blockEnv: RunEnv,
): Promise<void> | undefined => {
  if (blockTaskSet.has(ctx.task) === false) return undefined
  ctx.onTestFinished(() => finish())
  return runPromise(Effect.asVoid(contextEffect), ctx, blockEnv)
}

const layerImpl = <R, E>(layer_: Layer.Layer<R, E>, options?: LayerOptions): BlockRegistrar<R> =>
  layerFor(() => layer_, options, undefined)

/** @internal */
export const layer: {
  <R, E>(layer_: Layer.Layer<R, E>, options?: LayerOptions): BlockRegistrar<R>
  <R, E>(options?: LayerOptions): (layer_: Layer.Layer<R, E>) => BlockRegistrar<R>
} = Function.dual(byLayer, layerImpl)

const withinTimeout = (elapsed: Duration.Input, timeout: Duration.Input): boolean =>
  Duration.isLessThanOrEqualTo(Duration.fromInputUnsafe(elapsed), Duration.fromInputUnsafe(timeout))

const retryWithin = (timeout: Duration.Input) =>
  Schedule.while(Schedule.recurs(10), (state) => Effect.succeed(withinTimeout(state.elapsed, timeout)))

const flakyTestImpl = <A, E, R>(
  self: Effect.Effect<A, E, R | Scope.Scope>,
  timeout: Duration.Input = Duration.seconds(30),
): Effect.Effect<A, never, R> =>
  self.pipe(
    Effect.scoped,
    Effect.sandbox,
    (sandboxed) => Effect.retry(sandboxed, retryWithin(timeout)),
    Effect.orDie,
  )

/** @internal */
export const flakyTest: {
  <A, E, R>(self: Effect.Effect<A, E, R | Scope.Scope>, timeout?: Duration.Input): Effect.Effect<A, never, R>
  (timeout?: Duration.Input): <A, E, R>(self: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, never, R>
} = Function.dual(byEffect, flakyTestImpl)

/**
 * The lanes a removed habit name reaches: the call is refused with its rewrite, on the `this` type and at run
 * time, and the property the lane used to carry still runs (R9, KTD3).
 */
const refuseHabitLane = (text: string): never => {
  throw refusalError(text)
}

const effectLaneRefusal = <R, Text extends string>(
  prop: Vitest.Vitest.EffectLane<R, Text>['prop'],
  text: Text,
): Vitest.Vitest.EffectLane<R, Text> => Object.assign(() => refuseHabitLane(text), { prop })

/**
 * The lanes over one `mapEffect`: `it`, its modifiers and `it.each` all register the same generator body, and
 * the Effect-lane property is bound to the same services the lane provides (R7, R9).
 */
const makeTesterWith = <R>(
  mapEffect: MapEffect<R>,
  it: V.TestAPI,
  envFor: () => RunEnv,
  rerunnable: boolean,
): Vitest.Vitest.Tester<R> => {
  const runOnce = (ctx: V.TestContext, body: LaneBody): Promise<void> => runLaned(ctx, mapEffect, envFor(), body)
  const rerun = (ctx: V.TestContext, body: LaneBody): Promise<void> =>
    outcomeOf(runOnce(ctx, body)).then(leakedOrNothing)
  const shouldRerun = (ctx: V.TestContext): boolean => rerunnable && isClean(ctx)
  const rerunIfClean = (ctx: V.TestContext, body: LaneBody): Promise<void> =>
    shouldRerun(ctx) ? rerun(ctx, body) : Promise.resolve()
  const run = (ctx: V.TestContext, body: LaneBody): Promise<void> =>
    outcomeOf(runOnce(ctx, body)).then((error) => {
      if (error !== undefined) throw error
      return rerunIfClean(ctx, body)
    })

  const registering = (registrar: Registrar): LaneRegister =>
  <Eff, AEff>(
    name: string,
    body: Vitest.Vitest.Body<Eff, AEff> | Vitest.Vitest.BodyRefusal,
    timeout?: Timeout,
  ): void => {
    const lane = laneBodyOf(body)
    marked(() => registrar(name, testOptions(timeout), (ctx) => run(ctx, lane)))
  }

  const dualLane = (registrar: Registrar): Vitest.Vitest.Test<R> => Function.dual(byName, registering(registrar))

  const base: Vitest.Vitest.Test<R> = dualLane(it)
  const skip: Vitest.Vitest.Test<R> = dualLane(it.skip)
  const skipIf = (condition: boolean): Vitest.Vitest.Test<R> => dualLane(it.skipIf(condition))
  const runIf = (condition: boolean): Vitest.Vitest.Test<R> => dualLane(it.runIf(condition))
  const only: Vitest.Vitest.Test<R> = dualLane(it.only)
  const fails: Vitest.Vitest.Test<R> = dualLane(it.fails)

  const each = <Row>(cases: ReadonlyArray<Row>): Vitest.Vitest.RowTest<Row, R> =>
  <Eff, AEff>(
    name: string,
    body: Vitest.Vitest.RowBody<Row, Eff, AEff> | Vitest.Vitest.BodyRefusal,
    timeout?: Timeout,
  ): void => {
    marked(() =>
      it.for(cases)(name, testOptions(timeout), (row: Row, ctx: V.TestContext) => run(ctx, rowBodyOf(row, body)))
    )
  }

  const effectProperty = makeProperty<R>({
    register: (name, program) => marked(() => it(name, (ctx) => runProperty(ctx, program))),
    provide: (effect) => mapEffect(effect, envFor()),
  })

  const prop: Vitest.Vitest.EffectProperty<R> = (name, spec, holds) => {
    refusePositional(spec)
    effectProperty.effectProp(name, spec, holds)
  }

  return Object.assign(base, { skip, skipIf, runIf, only, fails, each, prop })
}

/** The block's methods: the generator lanes, the refusing habit lanes, and the block's own nested `layer`. */
const methodsFor = <R>(
  mapEffect: MapEffect<R | Scope.Scope>,
  it: V.TestAPI,
  envFor: () => RunEnv,
  rerunnable: boolean,
  layer: Vitest.Vitest.LayerOf<R, Vitest.Vitest.NestedLayerOptions>,
): Vitest.Vitest.MethodsNonLive<R> => {
  const tester = makeTesterWith<R | Scope.Scope>(mapEffect, it, envFor, rerunnable)
  return Object.assign(tester, {
    effect: effectLaneRefusal(tester.prop, refuseEffectLane),
    scoped: effectLaneRefusal(tester.prop, refuseScopedLane),
    scopedLive: effectLaneRefusal(tester.prop, refuseScopedLiveLane),
    prop,
    law: property.law,
    flakyTest,
    layer,
  })
}

const refuseHookNow = (): never => {
  throw refusalError(refuseHook)
}

const takesHook = (args: IArguments): boolean => typeof args[0] === 'function'

const refuseHookPair = <F>(fn: F, timeout?: number): never => {
  void fn
  void timeout
  return refuseHookNow()
}

type EachFirst = Parameters<typeof V.beforeEach>[0]

type AfterEachFirst = Parameters<typeof V.afterEach>[0]

/**
 * @internal
 */
export const beforeEach: {
  (this: HookRefusal, fn: EachFirst, timeout?: number): never
  (this: HookRefusal, timeout?: number): (fn: EachFirst) => never
} = Function.dual(takesHook, refuseHookPair)

/**
 * @internal
 */
export const afterEach: {
  (this: HookRefusal, fn: AfterEachFirst, timeout?: number): never
  (this: HookRefusal, timeout?: number): (fn: AfterEachFirst) => never
} = Function.dual(takesHook, refuseHookPair)

/**
 * The fork's `it`: the generator lanes on virtual time, the real-clock lane, the lawful property lanes and the
 * layer blocks, callable data-first (`it(name, body)`) or data-last (`it(body, timeout?)(name)`).
 *
 * @internal
 */
export const makeMethods = (it: V.TestAPI): Vitest.Vitest.Methods => {
  const base = methodsFor<never>(
    (effect, env) => effect.pipe(Effect.scoped, (scoped) => Effect.provide(scoped, testEnv(env))),
    it,
    perRun,
    true,
    layer,
  )
  const live = makeTesterWith<Scope.Scope>((effect) => Effect.scoped(effect), it, () => realTime, true)
  return Object.assign(base, { live, layer })
}

const describeImpl = (name: string, f: (it: Vitest.Vitest.Methods) => void): V.SuiteCollector =>
  V.describe(name, { concurrent: true, shuffle: true }, (it) => f(makeMethods(it)))

/** @internal */
export const describeWrapped: {
  (name: string, f: (it: Vitest.Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = Function.dual(byName, describeImpl)
