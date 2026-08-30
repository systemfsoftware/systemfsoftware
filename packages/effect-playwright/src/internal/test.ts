/**
 * Playwright Test integration for Effect programs.
 *
 * Playwright Test owns its fixtures and their lifetimes. Effect programs receive
 * non-owning wrappers for the active `browser`, `context`, and `page`; resources
 * acquired by the program remain scoped to that program. Because Playwright does
 * not expose a public test-completion signal, timeout interruption starts during
 * test-scoped fixture teardown, after user `afterEach` hooks have run.
 *
 * @since 0.6.0
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
import { BrowserContext, makeBrowserContext } from './browser-context.js'
import { Browser, makeBrowser } from './browser.js'
import { makePage, Page } from './page.js'

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
 * @since 0.6.0
 * @internal
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
 * @since 0.6.0
 * @internal
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
 * @since 0.6.0
 * @internal
 */
export interface EffectTest<Args extends object, R = never> {
  <A, E>(title: string, body: EffectTestFunction<Args, A, E, R>): void
  <A, E>(
    title: string,
    details: TestDetails,
    body: EffectTestFunction<Args, A, E, R>,
  ): void
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
 * @since 0.6.0
 * @internal
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
 *
 * @since 0.6.0
 * @internal
 */
export interface LayerOptions {
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
}
/**
 * Options for a nested shared layer. Nested layers reuse their parent's memo
 * map and may configure their own setup and teardown timeout.
 *
 * @since 0.6.0
 * @internal
 */
export interface NestedLayerOptions {
  readonly timeout?: Duration.Input
}

/**
 * Registers tests that share an acquired Effect layer, optionally inside a
 * named Playwright `describe` block.
 *
 * @since 0.6.0
 * @internal
 */
export interface LayerRegistration<T extends object, W extends object, R> {
  (f: (test: LayerTestMethods<T, W, R>) => void): void
  (name: string, f: (test: LayerTestMethods<T, W, R>) => void): void
}

/**
 * Playwright test methods available inside a shared-layer registration block.
 * The `effect` and `scoped` methods receive the layer's services, and `layer`
 * adds another layer that depends on the current one.
 *
 * @since 0.6.0
 * @internal
 */
export type LayerTestMethods<T extends object, W extends object, R> =
  & TestType<
    T,
    W
  >
  & {
    readonly effect: EffectTester<T & W, R>
    readonly scoped: EffectTester<T & W, R>
    readonly layer: <R2, E>(
      layer: Layer.Layer<R2, E, R>,
      options?: NestedLayerOptions,
    ) => LayerRegistration<T, W, R | R2>
  }

/**
 * Creates a registration block whose tests share an Effect layer.
 *
 * @since 0.6.0
 * @internal
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
 * @since 0.6.0
 * @internal
 */
export type TestMethods<T extends object, W extends object> = TestType<T, W> & {
  readonly effect: EffectTester<T & W>
  readonly layer: LayerMethod<T, W>
}

interface EffectRunner {
  readonly abortController: AbortController
  readonly context: Context.Context<Exclude<TestEnvironment, Scope.Scope>>
  readonly running: Set<Promise<unknown>>
  closed: boolean
}

interface InternalFixtures {
  _effectPlaywrightRuntime: EffectRunner
}

const activeRunners = new WeakMap<TestInfo, EffectRunner>()
const augmentedTesters = new WeakMap<object, EffectTester<object>>()
const noActiveRuntimeMessage = 'effect-playwright/test: no active Effect runtime for this test'

const runPromise = <A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const exit = yield* Effect.exit(effect)
      if (Exit.isFailure(exit)) {
        const errors = Cause.prettyErrors(exit.cause)
        yield* Effect.forEach(errors, (e) => {
          console.error(e)
          return Effect.void
        })
      }
      return yield* exit
    }),
    { signal },
  )

type EffectTransform<R> = <A, E>(
  effect: Effect.Effect<A, E, TestEnvironment | R>,
) => Effect.Effect<A, E, TestEnvironment>

const withoutLayer: EffectTransform<never> = (effect) => effect

const makeEffectTest = <Args extends object, R>(
  register: (
    title: string,
    details: TestDetails | undefined,
    body: (args: Args, testInfo: TestInfo) => Promise<void>,
  ) => void,
  transform: EffectTransform<R>,
): EffectTest<Args, R> => {
  function effectTest<A, E>(
    title: string,
    body: EffectTestFunction<Args, A, E, R>,
  ): void
  function effectTest<A, E>(
    title: string,
    details: TestDetails,
    body: EffectTestFunction<Args, A, E, R>,
  ): void
  function effectTest<A, E>(
    title: string,
    detailsOrBody: TestDetails | EffectTestFunction<Args, A, E, R>,
    possibleBody?: EffectTestFunction<Args, A, E, R>,
  ): void {
    const details = typeof detailsOrBody === 'function' ? undefined : detailsOrBody
    const body = typeof detailsOrBody === 'function' ? detailsOrBody : possibleBody
    if (body === undefined) {
      throw new TypeError('effect-playwright/test: missing Effect test body')
    }

    const wrapped = (args: Args, testInfo: TestInfo): Promise<void> => {
      const runner = activeRunners.get(testInfo)
      if (runner === undefined || runner.closed) {
        return Promise.reject(new Error(noActiveRuntimeMessage))
      }

      const program = transform(
        Effect.suspend(() => body(args, testInfo)),
      ).pipe(Effect.provide(runner.context), Effect.scoped, Effect.asVoid)
      const promise = runPromise(program, runner.abortController.signal)
      runner.running.add(promise)
      void promise.then(
        () => runner.running.delete(promise),
        () => runner.running.delete(promise),
      )
      return promise
    }
    Object.defineProperty(wrapped, 'toString', {
      value: () => body.toString(),
    })
    register(title, details, wrapped)
  }
  return effectTest
}

const makeTester = <T extends object, W extends object, R>(
  effectTestType: TestType<T & InternalFixtures, W>,
  transform: EffectTransform<R>,
): EffectTester<T & W, R> => {
  const makeRegistration = (
    invoke: (
      title: string,
      details: TestDetails | undefined,
      body: (args: T & W & InternalFixtures, testInfo: TestInfo) => Promise<void>,
    ) => void,
  ): EffectTest<T & W, R> => makeEffectTest<T & W, R>((title, details, body) => invoke(title, details, body), transform)

  const testerBase = makeRegistration((title, details, body) => {
    if (details === undefined) {
      effectTestType(title, body)
    } else {
      effectTestType(title, details, body)
    }
  })

  const failBase = makeRegistration((title, details, body) => {
    if (details === undefined) {
      effectTestType.fail(title, body)
    } else {
      effectTestType.fail(title, details, body)
    }
  })

  const fail: EffectTester<T & W, R>['fail'] = Object.assign(failBase, {
    only: makeRegistration((title, details, body) => {
      if (details === undefined) {
        effectTestType.fail.only(title, body)
      } else {
        effectTestType.fail.only(title, details, body)
      }
    }),
  })

  const tester: EffectTester<T & W, R> = Object.assign(testerBase, {
    only: makeRegistration((title, details, body) => {
      if (details === undefined) {
        effectTestType.only(title, body)
      } else {
        effectTestType.only(title, details, body)
      }
    }),
    skip: makeRegistration((title, details, body) => {
      if (details === undefined) {
        effectTestType.skip(title, body)
      } else {
        effectTestType.skip(title, details, body)
      }
    }),
    fixme: makeRegistration((title, details, body) => {
      if (details === undefined) {
        effectTestType.fixme(title, body)
      } else {
        effectTestType.fixme(title, details, body)
      }
    }),
    fail,
  })

  return tester
}

const makeLayer = <T extends object, W extends object, R, E>(
  testType: TestType<T, W>,
  effectTestType: TestType<T & InternalFixtures, W>,
  layer: Layer.Layer<R, E>,
  options?: LayerOptions,
): LayerRegistration<T, W, R> => {
  const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Effect.runSync(Scope.make())
  // Effect.cached wraps in Effect<Effect<Context<R>>>: runSync evaluates the outer
  // wrapper only, so runtimeEffect remains an Effect yielding the built Context.
  const runtimeEffect = Layer.buildWithMemoMap(layer, memoMap, scope).pipe(
    Effect.orDie,
    Effect.cached,
    Effect.runSync,
  )
  const transform: EffectTransform<R> = (effect) =>
    Effect.flatMap(runtimeEffect, (context) => Effect.provide(effect, context))
  const tester = makeTester<T, W, R>(effectTestType, transform)

  const makeLayerMethods = (): LayerTestMethods<T, W, R> => {
    // oxlint-disable-next-line typescript/unbound-method -- Playwright's TestType callables are plain functions (no `this`); bind prevents an accidental receiver while keeping a single registration frame.
    const withTestType: TestType<T, W> = testType.bind(undefined)
    const nestedLayer = <R2, E2>(
      nested: Layer.Layer<R2, E2, R>,
      nestedOptions?: NestedLayerOptions,
    ): LayerRegistration<T, W, R | R2> =>
      makeLayer(testType, effectTestType, Layer.provideMerge(nested, layer), {
        memoMap,
        ...(nestedOptions?.timeout !== undefined ? { timeout: nestedOptions.timeout } : {}),
      })
    const layerTest: LayerTestMethods<T, W, R> = Object.assign(
      Object.assign(withTestType, testType),
      {
        effect: tester,
        scoped: tester,
        layer: nestedLayer,
      },
    )
    return layerTest
  }

  const registerHooks = (): void => {
    testType.beforeAll(
      // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright requires a destructuring first arg; this block consumes no fixtures.
      async ({}, testInfo: TestInfo) => {
        if (options?.timeout !== undefined) {
          testInfo.setTimeout(Duration.toMillis(options.timeout))
        }
        await runPromise(Effect.asVoid(runtimeEffect))
      },
    )
    testType.afterAll(
      // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright requires a destructuring first arg; this block consumes no fixtures.
      async ({}, testInfo: TestInfo) => {
        if (options?.timeout !== undefined) {
          testInfo.setTimeout(Duration.toMillis(options.timeout))
        }
        await runPromise(Scope.close(scope, Exit.void))
      },
    )
  }

  function register(f: (test: LayerTestMethods<T, W, R>) => void): void
  function register(
    name: string,
    f: (test: LayerTestMethods<T, W, R>) => void,
  ): void
  function register(
    nameOrFunction: string | ((test: LayerTestMethods<T, W, R>) => void),
    possibleFunction?: (test: LayerTestMethods<T, W, R>) => void,
  ): void {
    if (typeof nameOrFunction === 'function') {
      testType.describe(() => {
        registerHooks()
        nameOrFunction(makeLayerMethods())
      })
      return
    }
    if (possibleFunction === undefined) {
      throw new TypeError('effect-playwright/test: missing layer test body')
    }
    testType.describe(nameOrFunction, () => {
      registerHooks()
      possibleFunction(makeLayerMethods())
    })
  }

  return register
}

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
 * @since 0.6.0
 * @internal
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
  const cached = augmentedTesters.get(testType)
  if (cached !== undefined) {
    const isTestMethods = (value: TestType<T, W>): value is TestMethods<T, W> =>
      Object.hasOwn(value, 'effect') && Object.hasOwn(value, 'layer')
    if (isTestMethods(testType)) {
      return testType
    }
  }
  if (Object.hasOwn(testType, 'effect') || Object.hasOwn(testType, 'layer')) {
    const method = Object.hasOwn(testType, 'effect') ? 'effect' : 'layer'
    throw new Error(
      `effect-playwright/test: the supplied TestType already defines "${method}"`,
    )
  }
  const fixtures: Record<string, unknown> = {
    _effectPlaywrightRuntime: [
      async (
        { browser, context, page }: T & W & InternalFixtures,
        use: (runner: EffectRunner) => Promise<void>,
        testInfo: TestInfo,
      ) => {
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
        try {
          await use(runner)
        } finally {
          runner.closed = true
          runner.abortController.abort()
          await Promise.allSettled(runner.running)
          activeRunners.delete(testInfo)
        }
      },
      { auto: true, box: true, timeout: 0 },
    ],
  }
  const effectTestType = testType.extend<InternalFixtures>(
    fixtures as Fixtures<
      InternalFixtures,
      {},
      Pick<PlaywrightTestArgs, 'context' | 'page'>,
      Pick<PlaywrightWorkerArgs, 'browser'>
    >,
  )
  const tester = makeTester<T, W, never>(effectTestType, withoutLayer)
  const layerMethod: LayerMethod<T, W> = (layer, options) => makeLayer(testType, effectTestType, layer, options)
  augmentedTesters.set(testType, tester)
  const result: TestMethods<T, W> = Object.assign(testType, {
    effect: tester,
    layer: layerMethod,
  })
  return result
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
 * @since 0.6.0
 * @internal
 */
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
 * @since 0.6.0
 * @internal
 */
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
 * @since 0.6.0
 * @internal
 */
export const effect = test.effect
