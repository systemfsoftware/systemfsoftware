/**
 * Playwright Test integration for Effect programs.
 *
 * Playwright Test owns its fixtures and their lifetimes. Effect programs receive
 * non-owning wrappers for the active `browser`, `context`, and `page`; resources
 * acquired by the program remain scoped to that program. Because Playwright does
 * not expose a public test-completion signal, timeout interruption starts during
 * test-scoped fixture teardown, after user `afterEach` hooks have run.
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
import { BrowserContext } from './browser-context.js'
import { Browser } from './browser.js'
import { Page } from './page.js'
import { makeBrowser, makeBrowserContext, makePage } from './wrappers.js'

/**
 * Re-exports Playwright Test's fixtures, assertions, and test APIs.
 *
 * @see https://playwright.dev/docs/api/class-test
 */
export * from '@playwright/test'

/**
 * Services available to an Effect-based Playwright test.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
export type TestEnvironment = Browser | BrowserContext | Page | Scope.Scope

/**
 * An Effect-returning Playwright Test callback.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
export type EffectTestFunction<Args extends object, A, E, R = never> = (
  args: Args,
  testInfo: TestInfo,
) => Effect.Effect<A, E, TestEnvironment | R>

/**
 * Registers Effect-based Playwright tests.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
export interface EffectTest<Args extends object, R = never> {
  <A, E>(title: string, body: EffectTestFunction<Args, A, E, R>): void
  <A, E>(title: string, details: TestDetails, body: EffectTestFunction<Args, A, E, R>): void
}

/**
 * Effect-based Playwright test registration and modifiers.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-annotations
 */
export interface EffectTester<Args extends object, R = never> extends EffectTest<Args, R> {
  readonly only: EffectTest<Args, R>
  readonly skip: EffectTest<Args, R>
  readonly fixme: EffectTest<Args, R>
  readonly fail: EffectTest<Args, R> & { readonly only: EffectTest<Args, R> }
}

/**
 * Options for acquiring an Effect layer shared by a test registration block.
 * `memoMap` controls layer memoization, while `timeout` bounds setup and
 * teardown.
 */
export interface LayerOptions {
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
}

/**
 * Options for a nested shared layer. Nested layers reuse their parent's memo
 * map and may configure their own setup and teardown timeout.
 */
export interface NestedLayerOptions {
  readonly timeout?: Duration.Input
}

/**
 * Registers tests that share an acquired Effect layer, optionally inside a
 * named Playwright `describe` block.
 */
export interface LayerRegistration<T extends object, W extends object, R> {
  (f: (test: LayerTestMethods<T, W, R>) => void): void
  (name: string, f: (test: LayerTestMethods<T, W, R>) => void): void
}

/**
 * Playwright test methods available inside a shared-layer registration block.
 * The `effect` and `scoped` methods receive the layer's services, and `layer`
 * adds another layer that depends on the current one.
 */
export type LayerTestMethods<T extends object, W extends object, R> = TestType<T, W> & {
  readonly effect: EffectTester<T & W, R>
  readonly scoped: EffectTester<T & W, R>
  readonly layer: <R2, E>(
    layer: Layer.Layer<R2, E, R>,
    options?: NestedLayerOptions,
  ) => LayerRegistration<T, W, R | R2>
}

/**
 * Creates a registration block whose tests share an Effect layer.
 */
export type LayerMethod<T extends object, W extends object> = <R, E>(
  layer: Layer.Layer<R, E>,
  options?: LayerOptions,
) => LayerRegistration<T, W, R>

/**
 * A Playwright `TestType` enhanced with Effect-based registration methods.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
export type TestMethods<T extends object, W extends object> = TestType<T, W> & {
  readonly effect: EffectTester<T & W>
  readonly layer: LayerMethod<T, W>
}

interface EffectRunner {
  readonly abortController: AbortController
  readonly context: Context.Context<Exclude<TestEnvironment, Scope.Scope>>
  readonly running: Set<Promise<void>>
  closed: boolean
}

interface InternalFixtures {
  readonly _effectPlaywrightRuntime: EffectRunner
}

type EffectTestArgs = Pick<PlaywrightTestArgs, 'context' | 'page'>

type EffectWorkerArgs = Pick<PlaywrightWorkerArgs, 'browser'>

const activeRunners = new WeakMap<TestInfo, EffectRunner>()
const augmentedTestTypes = new WeakSet<object>()
const noActiveRuntimeMessage = 'effect-playwright/test: no active Effect runtime for this test'

const isRunnerOpen = (runner: EffectRunner | undefined): runner is EffectRunner =>
  runner !== undefined && !runner.closed

const activeRunner = (testInfo: TestInfo): EffectRunner | undefined => {
  const runner = activeRunners.get(testInfo)
  return isRunnerOpen(runner) ? runner : undefined
}

const runPromise = <A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const exit = yield* Effect.exit(effect)
      if (Exit.isFailure(exit)) {
        const errors = Cause.prettyErrors(exit.cause)
        yield* Effect.forEach(errors, (e) => Effect.logError(e))
      }
      return yield* exit
    }),
    { signal },
  )

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
  const runner = activeRunner(testInfo)
  if (runner === undefined) {
    return Promise.reject(new Error(noActiveRuntimeMessage))
  }

  const program = transform(Effect.suspend(() => body(args, testInfo))).pipe(
    Effect.provide(runner.context),
    Effect.scoped,
    Effect.asVoid,
  )
  const promise = runPromise(program, runner.abortController.signal)
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
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures, invoked detached for caller-file attribution
    only: makeRegistration(effectTestType.fail.only),
  })
  return defineHiddenProperties(tester, {
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures, invoked detached for caller-file attribution
    only: makeRegistration(effectTestType.only),
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures, invoked detached for caller-file attribution
    skip: makeRegistration(effectTestType.skip),
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType methods are receiverless bound closures, invoked detached for caller-file attribution
    fixme: makeRegistration(effectTestType.fixme),
    fail,
  })
}

const withTimeout = (memoMap: Layer.MemoMap, timeout: Duration.Input | undefined): LayerOptions =>
  timeout === undefined ? { memoMap } : { memoMap, timeout }

const nestedLayerOptionsOf = (memoMap: Layer.MemoMap, nestedOptions?: NestedLayerOptions): LayerOptions => {
  if (nestedOptions === undefined) {
    return { memoMap }
  }
  return withTimeout(memoMap, nestedOptions.timeout)
}

const memoMapOptionOf = (options?: LayerOptions): Layer.MemoMap | undefined => options?.memoMap

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

const bindTestType = <T extends object, W extends object>(testType: TestType<T, W>): TestType<T, W> =>
  testType.bind(undefined)

const makeLayer = <T extends object, W extends object, R, E>(
  testType: TestType<T, W>,
  effectTestType: TestType<T & W & InternalFixtures, object>,
  layer: Layer.Layer<R, E>,
  options?: LayerOptions,
): LayerRegistration<T, W, R> => {
  const memoMap = memoMapOptionOf(options) ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Scope.makeUnsafe()
  const runtimeEffect = Layer.buildWithMemoMap(layer, memoMap, scope).pipe(Effect.orDie, Effect.cached, Effect.runSync)
  const transform: EffectTransform<R> = (effect) =>
    Effect.flatMap(runtimeEffect, (context) => Effect.provide(effect, context))
  const tester = makeTester<T & W, R>(effectTestType, transform)

  const makeLayerMethods = (): LayerTestMethods<T, W, R> => {
    const layerTest = bindTestType(testType)
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
    return defineHiddenProperties(layerTest, {
      effect: tester,
      layer: nestedLayer,
      scoped: tester,
    })
  }

  const registerHooks = (): void => {
    testType.beforeAll(
      // oxlint-disable-next-line no-empty-pattern -- Playwright validates fixture parameters are object destructuring patterns at runtime
      ({}, testInfo) => {
        applyTimeout(testInfo, options?.timeout)
        return runPromise(Effect.asVoid(runtimeEffect))
      },
    )
    testType.afterAll(
      // oxlint-disable-next-line no-empty-pattern -- Playwright validates fixture parameters are object destructuring patterns at runtime
      ({}, testInfo) => {
        applyTimeout(testInfo, options?.timeout)
        return runPromise(Scope.close(scope, Exit.void))
      },
    )
  }

  const registerNamed = (name: string, body: (test: LayerTestMethods<T, W, R>) => void): void => {
    testType.describe(name, () => {
      registerHooks()
      body(makeLayerMethods())
    })
  }

  const registerAnonymous = (body: (test: LayerTestMethods<T, W, R>) => void): void => {
    testType.describe(() => {
      registerHooks()
      body(makeLayerMethods())
    })
  }

  function register(f: (test: LayerTestMethods<T, W, R>) => void): void
  function register(name: string, f: (test: LayerTestMethods<T, W, R>) => void): void
  function register(
    nameOrFunction: string | ((test: LayerTestMethods<T, W, R>) => void),
    possibleFunction?: (test: LayerTestMethods<T, W, R>) => void,
  ): void {
    if (typeof nameOrFunction === 'function') {
      registerAnonymous(nameOrFunction)
      return
    }
    registerNamed(nameOrFunction, requireLayerBody<T, W, R>(possibleFunction))
  }

  return register
}

const definesAnyMethod = (testType: object): boolean =>
  Object.hasOwn(testType, 'effect') || Object.hasOwn(testType, 'layer')

const definedMethodOf = (testType: object): 'effect' | 'layer' => Object.hasOwn(testType, 'effect') ? 'effect' : 'layer'

/**
 * Narrows a `TestType` this module already augmented. The registry records the
 * augmentation itself, not its type parameters, so the fixture parameters of the
 * narrowing are the caller's view of the same test type.
 */
const isAugmented = <T extends object, W extends object>(
  testType: TestType<T, W>,
): testType is TestMethods<T, W> => augmentedTestTypes.has(testType) && definesAnyMethod(testType)

const assertNoDeclaredMethods = (testType: object): void => {
  if (definesAnyMethod(testType)) {
    throw new Error(`effect-playwright/test: the supplied TestType already defines "${definedMethodOf(testType)}"`)
  }
}

const releaseRunner = (runner: EffectRunner, testInfo: TestInfo): Promise<void> => {
  runner.closed = true
  runner.abortController.abort()
  return Promise.allSettled(runner.running).then(() => {
    activeRunners.delete(testInfo)
  })
}

// Returning the settled `result` re-adopts its rejection, so the original reason
// reaches Playwright after the release has finished.
const releaseAfter = <A>(result: Promise<A>, release: () => Promise<void>): Promise<A> =>
  result.then(
    (value) => release().then(() => value),
    () => release().then(() => result),
  )

/**
 * Adds Effect-based test methods to a Playwright `TestType`.
 *
 * Call `makeMethods` after `test.extend(...)` or `mergeTests(...)`, because those
 * APIs return a new `TestType`.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @example
 * ```ts
 * import { test as base } from "@playwright/test";
 * import { Effect } from "effect";
 * import { expect, makeMethods } from "effect-playwright/test";
 *
 * const test = makeMethods(
 *   base.extend<{ answer: number }>({
 *     answer: async ({}, use) => use(42),
 *   }),
 * );
 *
 * test.effect("uses a custom fixture", ({ answer }) =>
 *   Effect.sync(() => expect(answer).toBe(42)),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
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
          closed: false,
          context: Context.mergeAll(
            Context.make(Browser, makeBrowser(browser)),
            Context.make(BrowserContext, makeBrowserContext(context)),
            Context.make(Page, makePage(page)),
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

/**
 * The standard Playwright Test API enhanced with Effect test and layer methods.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the test type mirrors @playwright/test's title/body registration surface, which has no pipeable data-last form
export const test = makeMethods(playwrightTest)

/**
 * Shares an Effect `Layer` between Playwright tests in the current worker.
 *
 * The layer is acquired before the tests in the block and released after all
 * tests in the block finish. Passing a name wraps the tests in a Playwright
 * `describe` block. Layers can be nested and reuse their parent services.
 *
 * @example
 * ```ts
 * import { Context, Effect, Layer } from "effect";
 * import { expect, layer } from "effect-playwright/test";
 *
 * class Greeting extends Context.Service<Greeting, string>()("Greeting") {}
 *
 * layer(Layer.succeed(Greeting, "hello"))("Greeting", (it) => {
 *   it.effect("provides the layer", () =>
 *     Effect.gen(function* () {
 *       expect(yield* Greeting).toBe("hello");
 *     }),
 *   );
 * });
 * ```
 *
 * @see https://playwright.dev/docs/api/class-test#test-before-all
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the layer registration mirrors @playwright/test's registration surface, which has no pipeable data-last form
export const layer: LayerMethod<PlaywrightTestArgs, PlaywrightWorkerArgs> = test.layer

/**
 * Standalone alias for `test.effect`.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 * import { expect, test } from "effect-playwright/test";
 *
 * test.effect("loads a page", () =>
 *   Effect.gen(function* () {
 *     const page = yield* Playwright.Page;
 *     yield* page.goto("data:text/html,<title>Effect</title>");
 *     expect(yield* page.title).toBe("Effect");
 *   }),
 * );
 * ```
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the effect registration mirrors @playwright/test's title/body surface, which has no pipeable data-last form
export const effect = test.effect

/**
 * The standard Playwright Test API enhanced with Effect test and layer methods.
 */
export default test
