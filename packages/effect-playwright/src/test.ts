/**
 * Playwright Test integration for Effect programs.
 *
 * Playwright Test owns the `browser`, `context`, and `page` fixtures and their
 * lifetimes; an Effect test body receives them as the {@link Browser},
 * {@link BrowserContext}, and {@link Page} services. Playwright exposes no
 * test-completion signal, so a timed-out body is interrupted during test-scoped
 * fixture teardown, after user `afterEach` hooks have run.
 */

import {
  type Fixtures,
  type PlaywrightTestArgs,
  type PlaywrightWorkerArgs,
  test as playwrightTest,
  type TestDetails,
  type TestInfo,
  type TestType,
} from '@playwright/test'
import { Cause, Context, Duration, Effect, Exit, Layer, Scope } from 'effect'
import { Browser, BrowserContext, Page } from './services.js'

export * from '@playwright/test'

export type TestEnvironment = Browser | BrowserContext | Page | Scope.Scope

export type EffectTestFunction<Args extends object, A, E, R = never> = (
  args: Args,
  testInfo: TestInfo,
) => Effect.Effect<A, E, TestEnvironment | R>

export interface EffectTest<Args extends object, R = never> {
  <A, E>(title: string, body: EffectTestFunction<Args, A, E, R>): void
  <A, E>(title: string, details: TestDetails, body: EffectTestFunction<Args, A, E, R>): void
}

export interface EffectTester<Args extends object, R = never> extends EffectTest<Args, R> {
  readonly only: EffectTest<Args, R>
  readonly skip: EffectTest<Args, R>
  readonly fixme: EffectTest<Args, R>
  readonly fail: EffectTest<Args, R> & { readonly only: EffectTest<Args, R> }
}

/**
 * `memoMap` shares layer memoization with other blocks; `timeout` bounds the
 * layer's acquisition and release.
 */
export interface LayerOptions {
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
}

export interface NestedLayerOptions {
  readonly timeout?: Duration.Input
}

export interface LayerRegistration<T extends object, W extends object, R> {
  (f: (test: LayerTestMethods<T, W, R>) => void): void
  (name: string, f: (test: LayerTestMethods<T, W, R>) => void): void
}

export type LayerTestMethods<T extends object, W extends object, R> = TestType<T, W> & {
  readonly effect: EffectTester<T & W, R>
  readonly layer: <R2, E>(
    layer: Layer.Layer<R2, E, R>,
    options?: NestedLayerOptions,
  ) => LayerRegistration<T, W, R | R2>
}

export type LayerMethod<T extends object, W extends object> = <R, E>(
  layer: Layer.Layer<R, E>,
  options?: LayerOptions,
) => LayerRegistration<T, W, R>

export type TestMethods<T extends object, W extends object> = TestType<T, W> & {
  readonly effect: EffectTester<T & W>
  readonly layer: LayerMethod<T, W>
}

interface EffectRunner {
  readonly abortController: AbortController
  readonly context: Context.Context<Exclude<TestEnvironment, Scope.Scope>>
  readonly running: Set<Promise<void>>
}

interface InternalFixtures {
  readonly _effectPlaywrightRuntime: EffectRunner
}

type EffectTestArgs = Pick<PlaywrightTestArgs, 'context' | 'page'>

type EffectWorkerArgs = Pick<PlaywrightWorkerArgs, 'browser'>

const activeRunners = new WeakMap<TestInfo, EffectRunner>()
const augmentedTestTypes = new WeakSet<object>()
const noActiveRuntimeMessage = 'effect-playwright/test: no active Effect runtime for this test'

const logCause = <E>(cause: Cause.Cause<E>) => Effect.forEach(Cause.prettyErrors(cause), (e) => Effect.logError(e))

const logUnexpectedFailure = <A, E>(effect: Effect.Effect<A, E>, testInfo: TestInfo): Effect.Effect<A, E> =>
  testInfo.expectedStatus === 'failed' ? effect : Effect.tapCause(effect, logCause)

const runPromise = <A, E>(effect: Effect.Effect<A, E>, testInfo: TestInfo, signal?: AbortSignal): Promise<A> =>
  Effect.runPromise(logUnexpectedFailure(effect, testInfo), { signal })

type EffectTransform<R> = <A, E>(
  effect: Effect.Effect<A, E, TestEnvironment | R>,
) => Effect.Effect<A, E, TestEnvironment>

const withoutLayer: EffectTransform<never> = (effect) => effect

const requireEffectTestBody = <Args extends object, A, E, R>(
  body: EffectTestFunction<Args, A, E, R> | undefined,
): EffectTestFunction<Args, A, E, R> => {
  if (body === undefined) {
    throw new TypeError('effect-playwright/test: missing Effect test body')
  }
  return body
}

const detailsOf = <Args extends object, A, E, R>(
  detailsOrBody: TestDetails | EffectTestFunction<Args, A, E, R>,
): TestDetails | undefined => (typeof detailsOrBody === 'function' ? undefined : detailsOrBody)

const effectTestBodyOf = <Args extends object, A, E, R>(
  detailsOrBody: TestDetails | EffectTestFunction<Args, A, E, R>,
  possibleBody: EffectTestFunction<Args, A, E, R> | undefined,
): EffectTestFunction<Args, A, E, R> =>
  requireEffectTestBody(typeof detailsOrBody === 'function' ? detailsOrBody : possibleBody)

const defineHiddenProperties = <T extends object, P extends object>(target: T, properties: P): T & P => {
  const augmented = Object.assign(target, properties)
  for (const key of Object.keys(properties)) {
    Object.defineProperty(augmented, key, { configurable: false, enumerable: false, writable: false })
  }
  return augmented
}

const playwrightBody = <Args extends object, A, E, R>(
  body: EffectTestFunction<Args, A, E, R>,
  transform: EffectTransform<R>,
): (args: Args, testInfo: TestInfo) => Promise<void> =>
(args, testInfo) => {
  const runner = activeRunners.get(testInfo)
  if (runner === undefined) {
    return Promise.reject(new Error(noActiveRuntimeMessage))
  }

  const program = transform(Effect.suspend(() => body(args, testInfo))).pipe(
    Effect.provide(runner.context),
    Effect.scoped,
    Effect.asVoid,
  )
  const promise = runPromise(program, testInfo, runner.abortController.signal)
  runner.running.add(promise)
  void promise.then(
    () => runner.running.delete(promise),
    () => runner.running.delete(promise),
  )
  return promise
}

const makeEffectTest = <Args extends object, R>(
  register: (
    title: string,
    details: TestDetails | undefined,
    body: (args: Args, testInfo: TestInfo) => Promise<void>,
  ) => void,
  transform: EffectTransform<R>,
): EffectTest<Args, R> => {
  function effectTest<A, E>(title: string, body: EffectTestFunction<Args, A, E, R>): void
  function effectTest<A, E>(title: string, details: TestDetails, body: EffectTestFunction<Args, A, E, R>): void
  function effectTest<A, E>(
    title: string,
    detailsOrBody: TestDetails | EffectTestFunction<Args, A, E, R>,
    possibleBody?: EffectTestFunction<Args, A, E, R>,
  ): void {
    const body = effectTestBodyOf(detailsOrBody, possibleBody)
    const wrapper = playwrightBody(body, transform)
    // Playwright reads a test function's source to learn which fixtures it destructures.
    Object.defineProperty(wrapper, 'toString', {
      value: () => body.toString(),
    })
    register(title, detailsOf(detailsOrBody), wrapper)
  }
  return effectTest
}

type EffectRegistration<Args extends object> = {
  (title: string, body: (args: Args, testInfo: TestInfo) => Promise<void>): void
  (title: string, details: TestDetails, body: (args: Args, testInfo: TestInfo) => Promise<void>): void
}

const makeTester = <Args extends object, R>(
  effectTestType: TestType<Args & InternalFixtures, object>,
  transform: EffectTransform<R>,
): EffectTester<Args, R> => {
  const makeRegistration = (method: EffectRegistration<Args & InternalFixtures>): EffectTest<Args, R> =>
    makeEffectTest((title, details, body) => {
      if (details === undefined) {
        method(title, body)
      } else {
        method(title, details, body)
      }
    }, transform)

  const tester = makeRegistration(effectTestType)
  const fail = defineHiddenProperties(makeRegistration(effectTestType.fail), {
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures
    only: makeRegistration(effectTestType.fail.only),
  })
  return defineHiddenProperties(tester, {
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures
    only: makeRegistration(effectTestType.only),
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures
    skip: makeRegistration(effectTestType.skip),
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures
    fixme: makeRegistration(effectTestType.fixme),
    fail,
  })
}

const nestedLayerOptionsOf = (memoMap: Layer.MemoMap, nestedOptions?: NestedLayerOptions): LayerOptions => ({
  ...nestedOptions,
  memoMap,
})

const memoMapOf = (options?: LayerOptions): Layer.MemoMap | undefined => options?.memoMap

const applyTimeout = (testInfo: TestInfo, timeout: Duration.Input | undefined): void => {
  if (timeout !== undefined) {
    testInfo.setTimeout(Duration.toMillis(timeout))
  }
}

const requireLayerBody = <T extends object, W extends object, R>(
  body: ((test: LayerTestMethods<T, W, R>) => void) | undefined,
): (test: LayerTestMethods<T, W, R>) => void => {
  if (body === undefined) {
    throw new TypeError('effect-playwright/test: missing layer test body')
  }
  return body
}

const makeLayer = <T extends object, W extends object, R, E>(
  testType: TestType<T, W>,
  effectTestType: TestType<T & W & InternalFixtures, object>,
  layer: Layer.Layer<R, E>,
  options?: LayerOptions,
): LayerRegistration<T, W, R> => {
  const memoMap = memoMapOf(options) ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Scope.makeUnsafe()
  const runtimeEffect = Layer.buildWithMemoMap(layer, memoMap, scope).pipe(Effect.orDie, Effect.cached, Effect.runSync)
  const transform: EffectTransform<R> = (effect) =>
    Effect.flatMap(runtimeEffect, (context) => Effect.provide(effect, context))
  const tester = makeTester<T & W, R>(effectTestType, transform)

  const makeLayerMethods = (): LayerTestMethods<T, W, R> => {
    const layerTest = testType.bind(undefined)
    Object.assign(layerTest, testType)
    const nestedLayer = <R2, E2>(
      nested: Layer.Layer<R2, E2, R>,
      nestedOptions?: NestedLayerOptions,
    ): LayerRegistration<T, W, R | R2> =>
      makeLayer(
        testType,
        effectTestType,
        Layer.provideMerge(nested, layer),
        nestedLayerOptionsOf(memoMap, nestedOptions),
      )
    return defineHiddenProperties(layerTest, { effect: tester, layer: nestedLayer })
  }

  const registerBlock = (body: (test: LayerTestMethods<T, W, R>) => void) => () => {
    testType.beforeAll(
      // oxlint-disable-next-line no-empty-pattern -- Playwright validates fixture parameters are object destructuring patterns at runtime
      ({}, testInfo) => {
        applyTimeout(testInfo, options?.timeout)
        return runPromise(Effect.asVoid(runtimeEffect), testInfo)
      },
    )
    testType.afterAll(
      // oxlint-disable-next-line no-empty-pattern -- Playwright validates fixture parameters are object destructuring patterns at runtime
      ({}, testInfo) => {
        applyTimeout(testInfo, options?.timeout)
        return runPromise(Scope.close(scope, Exit.void), testInfo)
      },
    )
    body(makeLayerMethods())
  }

  function register(f: (test: LayerTestMethods<T, W, R>) => void): void
  function register(name: string, f: (test: LayerTestMethods<T, W, R>) => void): void
  function register(
    nameOrFunction: string | ((test: LayerTestMethods<T, W, R>) => void),
    possibleFunction?: (test: LayerTestMethods<T, W, R>) => void,
  ): void {
    if (typeof nameOrFunction === 'function') {
      testType.describe(registerBlock(nameOrFunction))
      return
    }
    testType.describe(nameOrFunction, registerBlock(requireLayerBody<T, W, R>(possibleFunction)))
  }

  return register
}

const definesAnyMethod = (testType: object): boolean =>
  Object.hasOwn(testType, 'effect') || Object.hasOwn(testType, 'layer')

const definedMethodOf = (testType: object): 'effect' | 'layer' => Object.hasOwn(testType, 'effect') ? 'effect' : 'layer'

const isAugmented = <T extends object, W extends object>(
  testType: TestType<T, W>,
): testType is TestMethods<T, W> => augmentedTestTypes.has(testType) && definesAnyMethod(testType)

const assertNoDeclaredMethods = (testType: object): void => {
  if (definesAnyMethod(testType)) {
    throw new Error(`effect-playwright/test: the supplied TestType already defines "${definedMethodOf(testType)}"`)
  }
}

const releaseRunner = (runner: EffectRunner, testInfo: TestInfo): Promise<void> => {
  activeRunners.delete(testInfo)
  runner.abortController.abort()
  return Promise.allSettled(runner.running).then(() => undefined)
}

// Returning the settled `result` re-adopts its rejection, so the original reason
// reaches Playwright after the release has finished.
const releaseAfter = <A>(result: Promise<A>, release: () => Promise<void>): Promise<A> =>
  result.then(
    (value) => release().then(() => value),
    () => release().then(() => result),
  )

/**
 * Adds `effect` and `layer` to a Playwright `TestType`. Call it after
 * `test.extend(...)` or `mergeTests(...)`, which return a new `TestType`.
 */
export const makeMethods: <
  T extends Pick<PlaywrightTestArgs, 'context' | 'page'>,
  W extends Pick<PlaywrightWorkerArgs, 'browser'>,
>(
  testType: TestType<T, W>,
) => TestMethods<T, W> = <
  T extends Pick<PlaywrightTestArgs, 'context' | 'page'>,
  W extends Pick<PlaywrightWorkerArgs, 'browser'>,
>(
  testType: TestType<T, W>,
): TestMethods<T, W> => {
  if (isAugmented(testType)) {
    return testType
  }
  assertNoDeclaredMethods(testType)

  const internalFixtures: Fixtures<InternalFixtures, {}, EffectTestArgs, EffectWorkerArgs> = {
    _effectPlaywrightRuntime: [
      ({ browser, context, page }, use, testInfo) => {
        const runner: EffectRunner = {
          abortController: new AbortController(),
          context: Context.mergeAll(
            Context.make(Browser, browser),
            Context.make(BrowserContext, context),
            Context.make(Page, page),
          ),
          running: new Set(),
        }
        activeRunners.set(testInfo, runner)
        return releaseAfter(use(runner), () => releaseRunner(runner, testInfo))
      },
      { auto: true, box: true, timeout: 0 },
    ],
  }
  const effectTestType = testType.extend<InternalFixtures>(internalFixtures)
  const typedEffectTestType: TestType<T & W & InternalFixtures, object> = effectTestType
  const tester = makeTester<T & W, never>(typedEffectTestType, withoutLayer)
  const layerMethod: LayerMethod<T, W> = (layer, options) => makeLayer(testType, typedEffectTestType, layer, options)
  augmentedTestTypes.add(testType)
  return defineHiddenProperties(testType, { effect: tester, layer: layerMethod })
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the test type mirrors @playwright/test's title/body registration surface, which has no pipeable data-last form
export const test = makeMethods(playwrightTest)

/**
 * Acquires an Effect layer once for the tests registered in the block and
 * releases it after they finish. A name wraps the block in `describe`.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the layer registration mirrors @playwright/test's registration surface, which has no pipeable data-last form
export const layer: LayerMethod<PlaywrightTestArgs, PlaywrightWorkerArgs> = test.layer

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the effect registration mirrors @playwright/test's title/body surface, which has no pipeable data-last form
export const effect = test.effect

export default test
