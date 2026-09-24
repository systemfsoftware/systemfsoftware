import * as Cause from 'effect/Cause'
import type * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Function from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Scheduler from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import * as TestClock from 'effect/testing/TestClock'
import * as TestConsole from 'effect/testing/TestConsole'
import * as V from 'vitest'
import type * as Vitest from '../mod.js'
import { errorCount, Running, withSyncRun } from './binding.js'
import { registerEqualTester } from './equal.js'
import * as Refusals from './errors.schema.js'
import { makeProperty, type PropertyRuntime } from './property/engine.js'
import { refuseAsync, refuseBareEffect, refuseNoAssertion, refusePositionalProp, refuseUnprovided } from './refusals.js'
import { makeStopState, stopAfterFailedCheck } from './step-boundary.js'
import { VitestTestContext } from './test-context.js'
import { makeVirtualRuntime, virtualClockLayer, type VirtualRuntime } from './virtual-time.js'

const getCurrentSuite = V.TestRunner.getCurrentSuite

/** @internal */
export type TestContext = TestConsole.TestConsole | TestClock.TestClock

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

/**
 * The positional form is refused at run time with the R15 rewrite; the public type already refuses it.
 */
const refusePositional = (spec: object | null | undefined): void => {
  if (lacksInputs(spec)) throw new Refusals.Slop({ detail: refusePositionalProp })
}

const lacksInputs = (spec: object | null | undefined): boolean => isAbsent(spec) || hasNoOf(spec)

const isAbsent = (spec: object | null | undefined): spec is null | undefined => spec === null || spec === undefined

const hasNoOf = (spec: object): boolean => Object.hasOwn(spec, 'of') === false

/**
 * How a run arms the step boundary: a test's `stopCheckOf` interrupts it once one of its checks failed (R6),
 * and `neverStop` leaves a property's verdict returned, so a `false` one still shrinks (R6, U4).
 */
type StopPolicy = (ctx: V.TestContext | undefined) => (() => boolean) | undefined

const stopCheckOf: StopPolicy = (ctx) => ctx === undefined ? undefined : failedAfter(ctx, errorCount(ctx))

const neverStop: StopPolicy = () => undefined

/** @internal */
export interface RunEnv {
  readonly runtime: VirtualRuntime | undefined
  readonly owned: boolean
  /** How the runs of this env arm the step boundary. */
  readonly stop: StopPolicy
}

/** @internal */
export const realTime: RunEnv = { runtime: undefined, owned: false, stop: stopCheckOf }

/** @internal */
export const perRun = (): RunEnv => ({ runtime: makeVirtualRuntime(), owned: true, stop: stopCheckOf })

const propertyEnv: RunEnv = { runtime: undefined, owned: false, stop: neverStop }

const logErrors = <E>(cause: Cause.Cause<E>): Effect.Effect<void, never, never> =>
  Effect.forEach(Cause.prettyErrors(cause), (error) => Effect.logError(error), { discard: true })

const failedAfter = (ctx: V.TestContext, before: number): () => boolean => () => errorCount(ctx) > before

const signalOf = (ctx: V.TestContext | undefined): AbortSignal | undefined => ctx?.signal

const signalOnly = (signal: AbortSignal | undefined): { readonly signal?: AbortSignal } =>
  signal === undefined ? {} : { signal }

const withScheduler = (
  signal: AbortSignal | undefined,
  scheduler: Scheduler.Scheduler,
): { readonly signal?: AbortSignal; readonly scheduler: Scheduler.Scheduler } => ({
  ...signalOnly(signal),
  scheduler,
})

const runOptions = (
  ctx: V.TestContext | undefined,
  scheduler: Scheduler.Scheduler | undefined,
): { readonly signal?: AbortSignal; readonly scheduler?: Scheduler.Scheduler } =>
  scheduler === undefined ? signalOnly(signalOf(ctx)) : withScheduler(signalOf(ctx), scheduler)

const baseScheduler = (env: RunEnv): Scheduler.Scheduler | undefined => env.runtime?.scheduler

const stopScheduler = (base: Scheduler.Scheduler | undefined, failedCheck: () => boolean): Scheduler.Scheduler =>
  stopAfterFailedCheck(base ?? new Scheduler.MixedScheduler(), makeStopState(failedCheck))

const pickScheduler = (env: RunEnv, failedCheck: (() => boolean) | undefined): Scheduler.Scheduler | undefined =>
  failedCheck === undefined ? baseScheduler(env) : stopScheduler(baseScheduler(env), failedCheck)

const runPromise = <A, E>(
  effect: Effect.Effect<A, E, never>,
  ctx?: V.TestContext,
  env: RunEnv = realTime,
): Promise<A | undefined> => {
  const failedCheck = env.stop(ctx)
  return runExit(effect, ctx, env, failedCheck).then(reportExit(failedCheck))
}

const runExit = <A, E>(
  effect: Effect.Effect<A, E, never>,
  ctx: V.TestContext | undefined,
  env: RunEnv,
  failedCheck: (() => boolean) | undefined,
): Promise<Exit.Exit<A, E>> => {
  const program = wrapOwned(effect, ownedRuntime(env))
  return Effect.runPromiseExit(program, runOptions(ctx, pickScheduler(env, failedCheck)))
}

const ownedRuntime = (env: RunEnv): VirtualRuntime | undefined => env.owned === false ? undefined : env.runtime

const observeOf = (runtime: VirtualRuntime | undefined): Effect.Effect<void, never, never> =>
  runtime === undefined ? Effect.void : runtime.observe

const endOf = (runtime: VirtualRuntime | undefined): Effect.Effect<void, never, never> =>
  runtime === undefined ? Effect.void : runtime.end

const wrapOwned = <A, E>(
  effect: Effect.Effect<A, E, never>,
  runtime: VirtualRuntime | undefined,
): Effect.Effect<A, E, never> => observeOf(runtime).pipe(Effect.andThen(effect.pipe(Effect.ensuring(endOf(runtime)))))

const stoppedThenNever = (): Promise<never> =>
  stoppedValue.then((): never => {
    throw new Error('unreachable: stopped run resolved')
  })

const stoppedValue: Promise<undefined> = Promise.resolve(undefined)

const stoppedExit = <E>(cause: Cause.Cause<E>): Promise<never> =>
  Cause.hasInterruptsOnly(cause) ? stoppedThenNever() : failExit(cause)

const stoppedChecked = <E>(cause: Cause.Cause<E>, failed: boolean): Promise<never> =>
  failed ? stoppedExit(cause) : failExit(cause)

const failedOrThrow = <E>(cause: Cause.Cause<E>, failedCheck: (() => boolean) | undefined): Promise<never> =>
  failedCheck === undefined ? failExit(cause) : stoppedChecked(cause, failedCheck())

const reportExit = <A, E>(
  failedCheck: (() => boolean) | undefined,
): (exit: Exit.Exit<A, E>) => Promise<A | undefined> =>
(exit) => Exit.isSuccess(exit) ? Promise.resolve(exit.value) : failedOrThrow(exit.cause, failedCheck)

/**
 * A body that needs a service nothing provides dies with Effect's own `Service not found`. That is a
 * test-authoring error — the layers were never wired — so it is reported as the unprovided rewrite (R9)
 * instead of as a raw defect. Failures an `owned` region is responsible for are recovered by their owner
 * and never reach here.
 */
const isUnprovided = (error: unknown): error is Error =>
  error instanceof Error && error.message.startsWith('Service not found')

const failExit = <E>(cause: Cause.Cause<E>): Promise<never> =>
  logErrors(cause).pipe(Effect.runPromise).then(() => rethrowSquashed(cause))

const rethrowSquashed = <E>(cause: Cause.Cause<E>): never => {
  const error = Cause.squash(cause)
  if (isUnprovided(error)) throw new Refusals.Slop({ detail: refuseUnprovided })
  throw error
}

const runTest =
  (ctx?: Vitest.TestContext, env: RunEnv = realTime) =>
  <A, E>(effect: Effect.Effect<A, E, never>): Promise<A | undefined> => {
    const promise = runPromise(effect, ctx, env)
    if (ctx !== undefined) trackAbort(ctx, promise)
    return promise
  }

const trackAbort = <A>(ctx: V.TestContext, promise: Promise<A>): void => {
  const onAbort = (): void => {
    ctx.onTestFinished(() => promise.then(noop, noop))
  }
  ctx.signal.addEventListener('abort', onAbort, { once: true })
  void promise.then(() => detach(ctx, onAbort), () => detach(ctx, onAbort))
  if (ctx.signal.aborted) onAbort()
}

const detach = (ctx: V.TestContext, onAbort: () => void): void => {
  ctx.signal.removeEventListener('abort', onAbort)
}

const noop = (): void => {}

const clockLayerOf = (env: RunEnv) => env.runtime === undefined ? TestClock.layer() : virtualClockLayer(env.runtime)

/** @internal */
export const testEnv = (env: RunEnv) => Layer.mergeAll(TestConsole.layer, clockLayerOf(env))

/**
 * The run a test's fibers execute in: the test's own context as `Running`, and the same context under the
 * fork's `VitestTestContext` for every library built on the fork.
 */
const bindRun = <A, E>(
  effect: Effect.Effect<A, E, never>,
  ctx: V.TestContext,
  shadow: boolean,
): Effect.Effect<A, E, never> =>
  effect.pipe(
    Effect.provideService(Running, { ctx, shadow }),
    Effect.provideService(VitestTestContext, ctx),
  )

/** What a test body hands back: an Effect, a promise (refused), or a plain value the assertion gate judges. */
type TestOutput = string | number | boolean | bigint | symbol | object | null | undefined

const isObject = (output: TestOutput): output is object => typeof output === 'object' && output !== null

const isThenable = (value: object): value is PromiseLike<object> =>
  'then' in value ? typeof value.then === 'function' : false

const isPromiseLike = (output: TestOutput): output is PromiseLike<object> => isObject(output) && isThenable(output)

const refusePromiseBody = (): never => {
  throw new Refusals.Slop({ detail: refuseAsync })
}

const refuseAfter = (promise: PromiseLike<object>): never => {
  void Promise.resolve(promise).catch(noop)
  return refusePromiseBody()
}

const checkPromiseBody = (output: TestOutput): void => {
  if (isPromiseLike(output)) refuseAfter(output)
}

const outputIsEffect = (output: TestOutput): output is Effect.Effect<never, never, never> => Effect.isEffect(output)

const buildSingleRun = <E>(
  body: (ctx: V.TestContext) => TestOutput,
  mapOne: (self: Effect.Effect<never, E, never>) => Effect.Effect<never, E, never>,
  env: RunEnv,
  shadow: boolean,
): (ctx: V.TestContext) => Promise<void> =>
(ctx: V.TestContext): Promise<void> => {
  const output = withSyncRun({ ctx, shadow }, () => body(ctx))
  checkPromiseBody(output)
  return outputIsEffect(output) ? runBuilt(ctx, env, mapOne, output, shadow) : Promise.resolve(undefined)
}

const runBuilt = <E>(
  ctx: V.TestContext,
  env: RunEnv,
  mapOne: (self: Effect.Effect<never, E, never>) => Effect.Effect<never, E, never>,
  output: Effect.Effect<never, never, never>,
  shadow: boolean,
): Promise<void> => runTest(ctx, env)(mapOne(bindRun(Effect.suspend(() => output), ctx, shadow)))

/**
 * Runs a property's program as the test that registered it, under the same binding the Effect lanes use, so a
 * check or an annotation inside `holds` belongs to the test that declared the property. The env is the bare
 * `propertyEnv`: no step boundary interrupts a property, so its `false` verdict still shrinks (R6, U4).
 */
const runProperty = <E>(
  ctx: V.TestContext,
  program: () => Effect.Effect<void, E, never>,
): Promise<void> =>
  buildSingleRun<E>(() => program(), (effect: Effect.Effect<never, E, never>) => effect, propertyEnv, false)(ctx)

/** The sync lane needs nothing provided, and every property test registers on the file's own `it`. */
const syncRuntime: PropertyRuntime<never> = {
  register: (name, program) => {
    V.it(name, (ctx) => runProperty(ctx, program))
  },
  provide: (effect) => effect,
}

const property = makeProperty(syncRuntime)

const isName = (first: unknown): first is string => typeof first === 'string'

const byName = (args: IArguments): boolean => isName(args[0])

const byLayer = (args: IArguments): boolean => Layer.isLayer(args[0])

const byEffect = (args: IArguments): boolean => Effect.isEffect(args[0])

const propImpl = <const G extends Vitest.Vitest.Gens, S extends Vitest.Vitest.PropertySubject, N extends number>(
  name: string,
  spec: Vitest.Vitest.PropertySpec<G, S, N>,
  holds: (subject: S, values: Vitest.Vitest.Values<G>) => boolean,
): void => {
  refusePositional(spec)
  property.prop(name, spec, holds)
}

/** @internal */
export const prop: Vitest.Vitest.Methods['prop'] = Function.dual(byName, propImpl)

type Timeout = number | V.TestOptions

type Registrar = (name: string, options: V.TestOptions, body: V.TestFunction<object>) => void

const outcomeOf = (promise: Promise<void>): Promise<Error | undefined> =>
  promise.then(() => undefined, (error: Error) => error)

/**
 * The second run's failure: a diagnosis the fork itself made is rethrown as that diagnosis, because the
 * second run exists to catch leaked state, not to relabel a refusal as a leak (F7). Anything else is the leak.
 */
const throwSecondRun = (error: Error): never => {
  if (isRefusal(error)) throw error
  return throwLeaked(error)
}

const leakedOrNothing = (error: Error | undefined): void => {
  if (error !== undefined) throwSecondRun(error)
}

const makeTesterWith = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>, env: RunEnv) => Effect.Effect<A, E, never>,
  it: V.TestAPI,
  envFor: () => RunEnv,
  rerunnable: boolean,
): Vitest.Vitest.Tester<R> => {
  const runOne = <A, E, TestArgs extends Vitest.Vitest.TestContextWithValues>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>,
    shadow: boolean,
  ): Promise<void> => {
    const env = envFor()
    const one = buildSingleRun<E>(
      () => self(...args),
      (effect: Effect.Effect<never, E, never>) => mapEffect(effect, env),
      env,
      shadow,
    )
    return one(ctx)
  }

  /**
   * The second run: the same layer build the first run used, built again, with the shadow flag set so its
   * checks throw instead of reporting softly (R5, KTD7).
   */
  const rerun = <A, E, TestArgs extends Vitest.Vitest.TestContextWithValues>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>,
  ): Promise<void> => outcomeOf(runOne(ctx, args, self, true)).then(leakedOrNothing)

  const run = <A, E, TestArgs extends Vitest.Vitest.TestContextWithValues>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>,
  ): Promise<void> => outcomeOf(runOne(ctx, args, self, false)).then((error) => afterFirst(ctx, args, self, error))

  const afterFirst = <A, E, TestArgs extends Vitest.Vitest.TestContextWithValues>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>,
    error: Error | undefined,
  ): Promise<void> => {
    if (error !== undefined) throwAfterCheck(ctx, error)
    gateNoAssertion(ctx)
    return rerunIfClean(ctx, args, self)
  }

  const rerunIfClean = <A, E, TestArgs extends Vitest.Vitest.TestContextWithValues>(
    ctx: V.TestContext & object,
    args: TestArgs,
    self: Vitest.Vitest.TestFunction<A, E, R, TestArgs>,
  ): Promise<void> => shouldRerun(ctx) ? rerun(ctx, args, self) : Promise.resolve()

  const shouldRerun = (ctx: V.TestContext): boolean => rerunnable && isClean(ctx)

  const registerOn = <A, E>(
    registrar: Registrar,
    name: string,
    self: Vitest.Vitest.TestFunction<A, E, R, [V.TestContext]>,
    timeout: Timeout | undefined,
  ): void => {
    registrar(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self))
  }

  const dualTest = (
    register: <A, E>(
      name: string,
      self: Vitest.Vitest.TestFunction<A, E, R, [V.TestContext]>,
      timeout?: Timeout,
    ) => void,
  ): Vitest.Vitest.Test<R> => Function.dual(byName, register)

  const f: Vitest.Vitest.Test<R> = dualTest((name, self, timeout) => registerOn(it, name, self, timeout))

  const skip: Vitest.Vitest.Tester<R>['skip'] = dualTest((name, self, timeout) =>
    registerOn(it.skip, name, self, timeout)
  )

  const skipIf: Vitest.Vitest.Tester<R>['skipIf'] = (condition) =>
    dualTest((name, self, timeout) => registerOn(it.skipIf(condition), name, self, timeout))

  const runIf: Vitest.Vitest.Tester<R>['runIf'] = (condition) =>
    dualTest((name, self, timeout) => registerOn(it.runIf(condition), name, self, timeout))

  const only: Vitest.Vitest.Tester<R>['only'] = dualTest((name, self, timeout) =>
    registerOn(it.only, name, self, timeout)
  )

  const each: Vitest.Vitest.Tester<R>['each'] = (cases) => (name, self, timeout) =>
    it.for(cases)(name, testOptions(timeout), (row, ctx) => run(ctx, [row], self))

  const fails: Vitest.Vitest.Tester<R>['fails'] = dualTest((name, self, timeout) =>
    registerOn(V.it.fails, name, self, timeout)
  )

  const effectProperty = makeProperty<R>({
    register: (name, program) => {
      it(name, (ctx) => runProperty(ctx, program))
    },
    provide: (effect) => mapEffect(effect, envFor()),
  })

  const testerProp: Vitest.Vitest.Tester<R>['prop'] = (name, spec, holds) => {
    refusePositional(spec)
    effectProperty.effectProp(name, spec, holds)
  }

  return Object.assign(f, { skip, skipIf, runIf, only, each, fails, prop: testerProp })
}

const makeTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>, env: RunEnv) => Effect.Effect<A, E, never>,
  it: V.TestAPI = V.it,
): Vitest.Vitest.Tester<R> => makeTesterWith(mapEffect, it, perRun, true)

const makeSharedTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>, env: RunEnv) => Effect.Effect<A, E, never>,
  it: V.TestAPI,
  envFor: () => RunEnv,
): Vitest.Vitest.Tester<R> => makeTesterWith(mapEffect, it, envFor, false)

const isSlop = (error: Error): error is Refusals.Slop => Schema.is(Refusals.Slop)(error)

/** Every failure the fork itself names, as `Schema.is`: the families a second run must not relabel. */
const refusalChecks: ReadonlyArray<(error: Error) => boolean> = [
  isSlop,
  Schema.is(Refusals.AfterFailedExpect),
  Schema.is(Refusals.MissingBudget),
  Schema.is(Refusals.NonBooleanVerdict),
  Schema.is(Refusals.LeakedState),
]

const isRefusal = (error: Error): boolean => refusalChecks.some((matches) => matches(error))

const throwAfterCheck = (ctx: V.TestContext, error: Error): never => {
  if (isSlop(error)) throw error
  return afterFailedCheck(ctx, error)
}

const afterFailedCheck = (ctx: V.TestContext, error: Error): never => {
  if (errorCount(ctx) > 0) throwAfterFailed()
  throw error
}

const throwAfterFailed = (): never => {
  throw new Refusals.AfterFailedExpect({
    detail: 'thrown after a failed expect above, most likely caused by it',
  })
}

/** Whether a run left no failure behind: the second run is only worth doing for a clean first one. */
const isClean = (ctx: V.TestContext): boolean => errorCount(ctx) === 0

const silentRun = (ctx: V.TestContext): boolean => errorCount(ctx) === 0 && assertionCalls(ctx) === 0

/**
 * The test's own assertion count. Every check the fork runs inside a test binds to that test's `expect`,
 * so a sibling test's checks are never visible here.
 */
const assertionCalls = (ctx: V.TestContext): number => ctx.expect.getState().assertionCalls

const gateNoAssertion = (ctx: V.TestContext): void => {
  if (silentRun(ctx)) throwNoAssertion()
}

const throwNoAssertion = (): never => {
  throw new Refusals.Slop({ detail: refuseNoAssertion })
}

const clipped = (message: string): string => message.length > 400 ? message.slice(0, 400) : message

const throwLeaked = (outcome: Error): never => {
  throw new Refusals.LeakedState({
    detail: '✗ this test passed, then failed when run again on a fresh build of its services: something keeps state ' +
      "outside its layer, so tests here see each other's changes. The second run failed with: " +
      clipped(outcome.message),
  })
}

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
   * Share one build of these layers across every test of the block, instead of giving each test its own
   * fresh build. The only way to share; nested blocks inherit it.
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
  withDefault(inherited, { runtime: makeVirtualRuntime(), owned: false, stop: stopCheckOf })

const memoMapOf = (options: LayerOptions | undefined): Layer.MemoMap =>
  withDefault(memoMapIn(options), Effect.runSync(Layer.makeMemoMap))

const blockHookTimeout = (options: LayerOptions | undefined): number | undefined => hookTimeout(timeoutIn(options))

const isSharedBlock = (options: LayerOptions | undefined): boolean => sharedIn(options) === true

/**
 * A named block's suite options: its tests run concurrently and in shuffled order (R4). A declared-shared
 * block is the stateful exception — its tests read each other's writes through one build, so it stays in
 * declaration order and runs alone.
 */
const describeOptions = (options: LayerOptions | undefined, shared: boolean): BlockRunOptions =>
  mergeBlockOptions(options, shared ? ALONE_BLOCK : CONCURRENT_BLOCK)

const mergeBlockOptions = (options: LayerOptions | undefined, fallback: BlockRunOptions): BlockRunOptions => ({
  concurrent: withDefault(concurrencyIn(options), fallback.concurrent),
  shuffle: fallback.shuffle,
})

/**
 * The block's layer with the test's own services merged in, unless the block excludes them. `Layer`'s output
 * is contravariant, so the merged layer is the *narrower* `Layer<R, E>` the callers provide to a run.
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
  const nestedOpen = <R2, E>(
    nestedLayer: Layer.Layer<R2, E, R>,
    nestedOptions: NestedLayer | undefined,
  ): BlockRegistrar<R | R2> =>
    layerFor((env) => Layer.provideMerge(nestedLayer, withTestEnv(env)), {
      ...nestedOptions,
      excludeTestServices,
    }, undefined)
  const nestedLayer: NestedLayerRegistrar<R> = Function.dual(byLayer, nestedOpen)
  const makeIt = (it: V.TestAPI): Vitest.Vitest.MethodsNonLive<R> =>
    makeItProxy(it, {
      effect: makeTester<R | Scope.Scope>(
        (effect, env) =>
          effect.pipe(
            Effect.scoped,
            (scoped) => Effect.provide(scoped, Layer.orDie(Layer.fresh(withTestEnv(env)))),
          ),
        it,
      ),
      prop,
      law: property.law,
      flakyTest,
      layer: nestedLayer,
    }, true)
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

const sharedOverrides = <R, E>(
  shared: Layer.Layer<R, E>,
  contextEffect: Effect.Effect<Context.Context<R>, never, never>,
  memoMap: Layer.MemoMap,
  blockEnv: RunEnv,
) => {
  const nestedOpen = <R2, E2>(
    nestedLayer: Layer.Layer<R2, E2, R>,
    nestedOptions: NestedLayer | undefined,
  ): BlockRegistrar<R | R2> =>
    layerFor(() => Layer.provideMerge(nestedLayer, shared), nestedBlock(nestedOptions, memoMap), blockEnv)
  const nestedLayer: NestedLayerRegistrar<R> = Function.dual(byLayer, nestedOpen)
  return {
    effect: makeSharedTester<R | Scope.Scope>(
      (effect) =>
        Effect.flatMap(contextEffect, (context) =>
          effect.pipe(
            Effect.scoped,
            (scoped) => Effect.provide(scoped, context),
          )),
      V.it,
      () => blockEnv,
    ),
    prop,
    law: property.law,
    flakyTest,
    layer: nestedLayer,
  }
}

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
  const makeIt = (it: V.TestAPI): Vitest.Vitest.MethodsNonLive<R> =>
    makeItProxy(it, sharedOverrides(shared, contextEffect, memoMap, blockEnv), false)
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

const blockTasksOf = (): ReadonlyArray<CollectedTask> => suiteTasks(getCurrentSuite())

const suiteTasks = (suite: { readonly tasks: ReadonlyArray<CollectedTask> }): ReadonlyArray<CollectedTask> =>
  suite.tasks

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

const collectOne = (task: CollectedTask, acc: Array<V.TestContext['task']>): void => {
  if (isRunnableTest(task)) acc.push(task)
  else collectNested(task, acc)
}

const collectNested = (task: CollectedTask, acc: Array<V.TestContext['task']>): void => {
  if (task.tasks !== undefined) collectTasks(task.tasks).forEach((nested) => acc.push(nested))
}

const notSkipped = (task: CollectedTask): boolean => task.mode !== 'skip' && task.mode !== 'todo'

const isRunnableTest = (task: CollectedTask): task is CollectedTask & V.TestContext['task'] =>
  task.type === 'test' && notSkipped(task)

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
  self.pipe(Effect.scoped, Effect.sandbox, (sandboxed) => Effect.retry(sandboxed, retryWithin(timeout)), Effect.orDie)

/** @internal */
export const flakyTest: {
  <A, E, R>(self: Effect.Effect<A, E, R | Scope.Scope>, timeout?: Duration.Input): Effect.Effect<A, never, R>
  (timeout?: Duration.Input): <A, E, R>(self: Effect.Effect<A, E, R | Scope.Scope>) => Effect.Effect<A, never, R>
} = Function.dual(byEffect, flakyTestImpl)

/** The argument of a registration: the name, the body, and Vitest's options, whichever the call supplied. */
type RegistrationArg = string | object | null | undefined

/** A test body as Vitest stores it: Vitest types the return `any`, and the lane reads it as the return union. */
type BareBody = (ctx: V.TestContext) => TestOutput

const isFunction = (arg: RegistrationArg): arg is BareBody => typeof arg === 'function'

/**
 * The two returns the bare lane refuses: a promise, which runs outside the test runtime (R9), and an Effect,
 * which the bare lane never runs — it belongs on `it.effect`.
 */
const refuseBareOutput = (output: TestOutput): void => {
  checkPromiseBody(output)
  if (outputIsEffect(output)) throw new Refusals.Slop({ detail: refuseBareEffect })
}

/** One pass of the bare body: it runs bound to the run's context, and its return is refused here. */
const bareRunOnce = (ctx: V.TestContext, self: BareBody, shadow: boolean): void => {
  const returned = withSyncRun({ ctx, shadow }, () => self(ctx))
  if (isObject(returned)) refuseBareOutput(returned)
}

/** The bare body's outcome: `undefined` when it passed, or the failure it threw or was refused with. */
const bareOutcome = (
  ctx: V.TestContext,
  self: BareBody,
  shadow: boolean,
): Promise<Error | undefined> => outcomeOf(Promise.resolve().then(() => bareRunOnce(ctx, self, shadow)))

const shouldRerunBare = (ctx: V.TestContext, rerunnable: boolean): boolean => rerunnable && isClean(ctx)

const afterBareGate = (ctx: V.TestContext, self: BareBody, rerunnable: boolean): Promise<void> =>
  shouldRerunBare(ctx, rerunnable) ? bareOutcome(ctx, self, true).then(leakedOrNothing) : Promise.resolve()

const afterBareFirst = (
  ctx: V.TestContext,
  self: BareBody,
  rerunnable: boolean,
  failure: Error | undefined,
): Promise<void> => {
  if (failure !== undefined) throwAfterCheck(ctx, failure)
  gateNoAssertion(ctx)
  return afterBareGate(ctx, self, rerunnable)
}

/**
 * The bare `it(name, body)` lane: Vitest's own registration with the fork's defaults instead of an Effect
 * lane. The body is synchronous, so it is gated for a leftover assertion and run a second time on its own,
 * which is what catches a body that only passes while nothing else touched its module (R5, R9).
 */
const runDefault = (ctx: V.TestContext, self: BareBody, rerunnable: boolean): Promise<void> =>
  bareOutcome(ctx, self, false).then((failure) => afterBareFirst(ctx, self, rerunnable, failure))

const defaultLane = (self: BareBody, rerunnable: boolean): BareBody => (ctx: V.TestContext) =>
  runDefault(ctx, self, rerunnable)

/**
 * The fork's `it`: Vitest's test API with the fork's Effect lanes and lawful property lanes attached,
 * callable data-first (`it(name, body)`) or data-last (`it(body, options?)(name)`).
 *
 * @internal
 */
export const makeMethods = (it: V.TestAPI): Vitest.Vitest.Methods =>
  makeItProxy(it, {
    effect: makeTester<Scope.Scope>(
      (effect, env) => effect.pipe(Effect.scoped, (scoped) => Effect.provide(scoped, testEnv(env))),
      it,
    ),
    live: makeTesterWith<Scope.Scope>(
      (effect) => Effect.scoped(effect),
      it,
      () => realTime,
      true,
    ),
    flakyTest,
    layer,
    prop,
    law: property.law,
  }, true)

/** @internal */
export const {
  /** @internal */
  effect,
  /** @internal */
  live,
} = makeMethods(V.it)

function makeItProxy<Methods extends object>(
  it: V.TestAPI,
  overrides: Methods,
  rerunnable: boolean,
): Methods & Vitest.API
function makeItProxy(it: V.TestAPI, overrides: object, rerunnable: boolean): V.TestAPI {
  return new Proxy(it, {
    apply: (target, thisArg: object, args: ReadonlyArray<RegistrationArg>) =>
      routeCall(target, thisArg, args, rerunnable),
    get: (target, property, receiver: object) => memberOrOverride(target, overrides, property, receiver),
  })
}

function routeCall(
  target: V.TestAPI,
  thisArg: object,
  args: ReadonlyArray<RegistrationArg>,
  rerunnable: boolean,
): void | ((name: string) => void) {
  return isName(args[0])
    ? applied(target, thisArg, args, rerunnable)
    : (name: string) => applied(target, thisArg, [name, args[0], args[1]], rerunnable)
}

/**
 * The route's registration. Vitest takes `[name, body]`, `[name, body, options]` or `[name, options, body]`,
 * so the body is the argument that is a function, and it is the one the fork's bare lane wraps. Vitest's own
 * helpers (`it.skip`, `it.each`, ...) come through the proxy's `get` trap and are handed over untouched.
 */
function applied(
  target: V.TestAPI,
  thisArg: object,
  args: ReadonlyArray<RegistrationArg>,
  rerunnable: boolean,
): void {
  Reflect.apply(
    target,
    thisArg,
    args.map((arg) => isFunction(arg) ? defaultLane(arg, rerunnable) : arg),
  )
}

function memberOrOverride(
  target: V.TestAPI,
  overrides: object,
  property: string | symbol,
  receiver: object,
): object | undefined {
  return Object.hasOwn(overrides, property)
    ? memberOf(overrides, property, receiver)
    : memberOf(target, property, receiver)
}

function memberOf<A extends object>(target: A, property: string | symbol, receiver: object): A[keyof A] | undefined {
  return Reflect.get(target, property, receiver)
}

const describeImpl = (name: string, f: (it: Vitest.Vitest.Methods) => void): V.SuiteCollector =>
  V.describe(name, { concurrent: true, shuffle: true }, (it) => f(makeMethods(it)))

/** @internal */
export const describeWrapped: {
  (name: string, f: (it: Vitest.Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = Function.dual(byName, describeImpl)
