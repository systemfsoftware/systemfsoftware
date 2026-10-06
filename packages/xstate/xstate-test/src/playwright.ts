import type { EventObject, Snapshot } from '@systemfsoftware/xstate'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import type {
  TestFixture,
  TestStateAssertions,
  TestSut,
  TestSutCompleteContext,
  TestSutContext,
  TestSutDisposeContext,
  TestSutSendContext,
  TestSutSession,
} from './engine/index.js'

/**
 * Awaits `value` as an Effect. A value and a thenable are both accepted, and a
 * rejection stays the same error object when the effect is run.
 */
const awaited = <A>(value: A | PromiseLike<A>): Effect.Effect<Awaited<A>> =>
  Effect.promise(() => Promise.resolve(value))

/** The fixture document a failed run stores next to its artifacts. */
const fixtureJson = (fixture: TestFixture): string => JSON.stringify(fixture, null, 2)

/**
 * The subset of the Playwright `Page` API this package uses.
 *
 * A real `Page` from `playwright` or `@playwright/test` is assignable to this
 * type, so no Playwright import is needed at runtime or at type-check time.
 * Everything is optional because only the parts your configuration reaches for
 * are used.
 *
 * @experimental
 */
export interface PlaywrightPage {
  readonly waitForLoadState?: (state?: any, options?: any) => Promise<void>
  readonly screenshot?: (options?: any) => Promise<any>
  readonly route?: (url: any, handler: any, options?: any) => Promise<unknown>
  readonly unroute?: (url: any, handler?: any) => Promise<void>
  readonly clock?: {
    readonly runFor?: (ticks: any) => Promise<void>
  }
  readonly context?: () => {
    readonly tracing?: {
      readonly start?: (options?: any) => Promise<void>
      readonly stop?: (options?: any) => Promise<void>
    }
  }
  readonly on?: (event: any, listener: any) => unknown
  readonly off?: (event: any, listener: any) => unknown
  readonly addInitScript?: (script: any, arg?: any) => Promise<unknown>
}

/**
 * The subset of Playwright's `TestInfo` this package uses. The `testInfo`
 * fixture of `@playwright/test` is assignable to it.
 *
 * @experimental
 */
export interface PlaywrightTestInfo {
  readonly attach: (
    name: string,
    options: {
      /** A string or a `Buffer`. */
      readonly body?: any
      readonly path?: string
      readonly contentType?: string
    },
  ) => Promise<void>
  readonly outputPath: (...pathSegments: string[]) => string
}

/**
 * The page-level oracles `createPlaywrightSut()` checks after every stable
 * step. Keys left out are off.
 *
 * @experimental
 */
export interface PlaywrightOracles {
  /** Fails on uncaught exceptions in the page (`pageerror`). */
  readonly pageError?: boolean
  /** Fails on console messages of this level or above. */
  readonly console?: 'error' | 'warn' | false
  /**
   * Fails on responses with at least this status code. Responses to requests
   * a `mocks` route handled are ignored.
   */
  readonly http?: number | false
  /** Fails on unhandled promise rejections in the page. */
  readonly unhandledRejection?: boolean
}

/**
 * Thrown by a session's `check()` when a page-level oracle fails.
 *
 * @experimental
 */
const PlaywrightOracleErrorBase = Data.TaggedError(
  '@systemfsoftware/xstate-test/playwright/PlaywrightOracleError',
)<{
  readonly message: string
  readonly cause: readonly string[]
}>

export class PlaywrightOracleError extends PlaywrightOracleErrorBase {
  public override readonly name = 'PlaywrightOracleError'

  public constructor(public readonly messages: readonly string[]) {
    super({
      message: `The page reported ${messages.length} error${messages.length === 1 ? '' : 's'}:\n${
        messages.map((message) => `  - ${message}`).join('\n')
      }`,
      cause: messages,
    })
  }
}

/**
 * A Playwright action bound to a generated event.
 *
 * @experimental
 */
export type PlaywrightEventAction<
  TPage extends PlaywrightPage,
  TEvent extends EventObject,
> = (page: TPage, event: TEvent) => void | Promise<void>

/**
 * Per-event-case network stubbing, applied before the event action runs.
 *
 * @experimental
 */
export type PlaywrightMock<TPage extends PlaywrightPage> = (
  page: TPage,
) => void | Promise<unknown>

/** @experimental */
export interface PlaywrightSutConfig<
  TPage extends PlaywrightPage,
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> {
  /** Performs each event against the page. */
  readonly events: {
    readonly [TType in TEvent['type']]?: PlaywrightEventAction<
      TPage,
      TEvent extends { type: TType } ? TEvent : never
    >
  }
  /**
   * Projects the DOM to a value comparable with the model projection. Omit it
   * (together with `projectModel`) to assert through `states` instead.
   */
  readonly read?: (page: TPage) => unknown | Promise<unknown>
  /** Projects the model snapshot to a value comparable with the page projection. */
  readonly projectModel?: (snapshot: TSnapshot) => unknown
  /**
   * Per-state assertions run after every stable step, keyed by state value (or
   * `'#id'`), with `'*'` as the fallthrough.
   */
  readonly states?: {
    readonly [stateKey: string]: (
      page: TPage,
      snapshot: TSnapshot,
    ) => void | Promise<void>
  }
  /** Normalizes the value read from the page before comparison. */
  readonly projectSut?: (observed: unknown) => unknown
  /** Compares model and page projections. Defaults to deep equality. */
  readonly equivalent?: (
    model: unknown,
    sut: unknown,
  ) => boolean | Promise<boolean>
  /**
   * Waits for the page to become quiescent before every comparison. Defaults to
   * `page.waitForLoadState('load')` followed by a microtask flush. Pass a
   * function to wait for something specific, such as a locator.
   */
  readonly settle?: (page: TPage) => void | Promise<void>
  /**
   * Advances page time. Defaults to `page.clock.runFor(milliseconds)` when
   * Playwright's clock API is installed, and returns no events.
   */
  readonly advance?: (
    page: TPage,
    milliseconds: number,
  ) => readonly TEvent[] | Promise<readonly TEvent[]>
  /**
   * Records a checkpoint. Defaults to a screenshot written to the
   * configured screenshot directory.
   */
  readonly checkpoint?: (page: TPage, label: string) => void | Promise<void>
  /** Directory for default checkpoint screenshots. */
  readonly screenshotDir?: string
  /** Runs once when a scenario session is created. */
  readonly reset?: (page: TPage) => void | Promise<void>
  /** Runs when a scenario stops. */
  readonly stop?: (page: TPage) => void | Promise<void>
  /** Runs when a scenario session is disposed. */
  readonly dispose?: (page: TPage) => void | Promise<void>
  /**
   * Per-case `page.route()` setup. When the property runner supplies the
   * generated event case, the key is looked up as `"<type>.<case>"` first and
   * then as `"<case>"`; otherwise (prefix, clock and replayed events) the key
   * is the case resolved by `caseOf`. Use it to steer an invoked service to
   * success or failure on different generated paths.
   *
   * Routes installed by a mock are unrouted before another case's mock is
   * applied and when the scenario session is disposed, so handlers do not
   * leak across cases or runs.
   */
  readonly mocks?: {
    readonly [caseId: string]: PlaywrightMock<TPage>
  }
  /**
   * Resolves the mock case for an event. Defaults to `event.case` when present,
   * otherwise `event.type`.
   */
  readonly caseOf?: (event: TEvent) => string | undefined
  /**
   * Page-level oracles checked after every stable step. `'defaults'` (the
   * default) fails on uncaught exceptions, console errors, unhandled
   * rejections, and responses with a status of 400 or above. `false` turns
   * them all off.
   */
  readonly oracles?: 'defaults' | false | PlaywrightOracles
  /**
   * Where failure artifacts are attached. Pass Playwright's `testInfo`
   * fixture. Required when `trace` or `screenshots` is on.
   */
  readonly testInfo?: PlaywrightTestInfo
  /**
   * Records a Playwright trace per run. `'retain-on-failure'` attaches the
   * trace of the failing run; `'on'` also attaches the last run's trace when
   * the campaign passes. Defaults to `'retain-on-failure'` with `testInfo`,
   * and `'off'` without.
   */
  readonly trace?: 'off' | 'retain-on-failure' | 'on'
  /**
   * `'on-failure'` attaches a screenshot of the page when the failing run
   * ends; `'every-step'` attaches one per stable step of the failing run.
   * Defaults to `'on-failure'` with `testInfo`, and `'off'` without.
   */
  readonly screenshots?: 'off' | 'on-failure' | 'every-step'
  /**
   * Wraps each event action, such as Playwright's `test.step`, so the report
   * shows one step per event.
   */
  readonly step?: (name: string, body: () => Promise<void>) => Promise<unknown>
}

const DEFAULT_ORACLES: Required<PlaywrightOracles> = {
  pageError: true,
  console: 'error',
  http: 400,
  unhandledRejection: true,
}

/** Marks the console messages the rejection listener writes. */
const REJECTION_PREFIX = '[xstate-test] unhandledrejection: '

const REJECTION_SCRIPT = `window.addEventListener('unhandledrejection', function (event) {
  var reason = event.reason;
  console.error(${JSON.stringify(REJECTION_PREFIX)} + (reason && reason.message ? reason.message : String(reason)));
});`

function resolveOracles(
  oracles: PlaywrightSutConfig<any, any, any>['oracles'],
): Required<PlaywrightOracles> | undefined {
  if (oracles === false) {
    return undefined
  }
  if (oracles === undefined || oracles === 'defaults') {
    return DEFAULT_ORACLES
  }
  return {
    pageError: oracles.pageError ?? false,
    console: oracles.console ?? false,
    http: oracles.http ?? false,
    unhandledRejection: oracles.unhandledRejection ?? false,
  }
}

function formatStepName(event: EventObject): string {
  const { type, ...payload } = event as EventObject & Record<string, unknown>
  return Object.keys(payload).length !== 0
    ? `${type} ${JSON.stringify(payload)}`
    : type
}

/** What the last failing session left behind, attached when the campaign ends. */
interface FailureArtifacts {
  readonly trace?: string
  readonly screenshot?: Uint8Array
  readonly steps: readonly Uint8Array[]
}

function defaultCaseOf(event: EventObject): string {
  const explicit = (event as { case?: unknown }).case
  return typeof explicit === 'string' ? explicit : event.type
}

type InstalledRoute = readonly unknown[]

/**
 * Wraps a page so every `route()` a mock installs is recorded and can be
 * removed again when another case's mock is applied or the session is disposed.
 */
function trackRoutes<TPage extends PlaywrightPage>(
  page: TPage,
  installed: InstalledRoute[],
  mockedRequests: WeakSet<object>,
): TPage {
  if (typeof (page as { route?: unknown }).route !== 'function') {
    return page
  }
  return new Proxy(page as object, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') {
        return value
      }
      if (property === 'route') {
        return (url: unknown, handler: unknown, ...rest: unknown[]) => {
          // Requests a mock handles are exempt from the `http` oracle.
          const tracked = typeof handler === 'function'
            ? (route: { request?: () => unknown }, ...more: unknown[]) => {
              const request = (more[0] ?? route?.request?.()) as unknown
              if (
                request !== undefined &&
                request !== null &&
                typeof request === 'object'
              ) {
                mockedRequests.add(request)
              }
              return handler(route, ...more)
            }
            : handler
          const args = [url, tracked, ...rest]
          installed.push(args)
          return value.apply(target, args)
        }
      }
      return value.bind(target)
    },
  }) as TPage
}

/** Removes every route a mock installed through {@link trackRoutes}. */
function releaseRoutes<TPage extends PlaywrightPage>(
  page: TPage,
  installed: InstalledRoute[],
): Promise<void> {
  return Effect.runPromise(Effect.gen(function*() {
    const unroute = page.unroute
    if (typeof unroute === 'function') {
      for (const args of installed) {
        yield* awaited(unroute.call(page, args[0], args[1]))
      }
    }
    installed.length = 0
  }))
}

/**
 * Resolves the mock for a generated event case, trying `"<type>.<case>"`, then
 * `"<case>"`, then the case resolved by `caseOf`.
 */
function resolveMock<TPage extends PlaywrightPage>(
  mocks: Record<string, PlaywrightMock<TPage> | undefined> | undefined,
  eventCase: { readonly type: string; readonly name: string } | undefined,
  fallbackCase: string | undefined,
): { key: string; mock: PlaywrightMock<TPage> } | undefined {
  if (mocks === undefined) {
    return undefined
  }
  const keys = [
    ...(eventCase !== undefined
      ? [`${eventCase.type}.${eventCase.name}`, eventCase.name]
      : []),
    ...(fallbackCase === undefined ? [] : [fallbackCase]),
  ]
  for (const key of keys) {
    const mock = mocks[key]
    if (mock !== undefined) {
      return { key, mock }
    }
  }
  return undefined
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

/**
 * Creates a `TestSut` that drives a Playwright page as the system under
 * test for `propertyTest()` and `testPaths()`.
 *
 * @experimental
 */
export const createPlaywrightSut: {
  <
    TPage extends PlaywrightPage,
    TSnapshot extends Snapshot<unknown> = Snapshot<unknown>,
    TEvent extends EventObject = EventObject,
  >(
    config: PlaywrightSutConfig<TPage, TSnapshot, TEvent>,
  ): (page: TPage) => TestSut<TSnapshot, TEvent>
  <
    TPage extends PlaywrightPage,
    TSnapshot extends Snapshot<unknown> = Snapshot<unknown>,
    TEvent extends EventObject = EventObject,
  >(
    page: TPage,
    config: PlaywrightSutConfig<TPage, TSnapshot, TEvent>,
  ): TestSut<TSnapshot, TEvent>
} = dual(2, function createPlaywrightSut<
  TPage extends PlaywrightPage,
  TSnapshot extends Snapshot<unknown> = Snapshot<unknown>,
  TEvent extends EventObject = EventObject,
>(
  page: TPage,
  config: PlaywrightSutConfig<TPage, TSnapshot, TEvent>,
): TestSut<TSnapshot, TEvent> {
  const caseOf = config.caseOf ?? (defaultCaseOf as (event: TEvent) => string)
  const screenshotDir = config.screenshotDir ?? 'property-screenshots'
  const testInfo = config.testInfo
  const trace = config.trace ?? (testInfo !== undefined ? 'retain-on-failure' : 'off')
  const screenshots = config.screenshots ?? (testInfo !== undefined ? 'on-failure' : 'off')
  if (testInfo === undefined && (trace !== 'off' || screenshots !== 'off')) {
    throw new Error(
      "`trace` and `screenshots` attach their files to `testInfo`; pass Playwright's `testInfo` fixture to `createPlaywrightSut()`.",
    )
  }
  const oracles = resolveOracles(config.oracles)
  let rejectionScriptInstalled = false
  let lastFailure: FailureArtifacts | undefined
  let lastPassingTrace: string | undefined

  return {
    ...(config.projectModel !== undefined
      ? { projectModel: config.projectModel }
      : {}),
    ...(config.projectSut !== undefined
      ? { projectSut: config.projectSut }
      : {}),
    ...(config.equivalent !== undefined
      ? { equivalent: config.equivalent }
      : {}),
    create: (_context: TestSutContext<TSnapshot, TEvent>): Promise<
      TestSutSession<TSnapshot, TEvent>
    > => {
      const collected: string[] = []
      const mockedRequests = new WeakSet<object>()
      const listeners: [string, (payload: any) => void][] = []
      const installRejectionScript = oracles !== undefined &&
        oracles.unhandledRejection && !rejectionScriptInstalled
      if (installRejectionScript) {
        // Init scripts accumulate, so it is installed once per SUT.
        rejectionScriptInstalled = true
      }
      if (oracles !== undefined && typeof page.on === 'function') {
        listeners.push(
          [
            'pageerror',
            (error: unknown) => {
              if (oracles.pageError) {
                collected.push(
                  `pageerror: ${error instanceof Error ? error.message : String(error)}`,
                )
              }
            },
          ],
          [
            'console',
            (message: { type: () => string; text: () => string }) => {
              const text = message.text()
              if (text.startsWith(REJECTION_PREFIX)) {
                if (oracles.unhandledRejection) {
                  collected.push(
                    `unhandledrejection: ${text.slice(REJECTION_PREFIX.length)}`,
                  )
                }
                return
              }
              const type = message.type()
              if (
                (type === 'error' && oracles.console !== false) ||
                (type === 'warning' && oracles.console === 'warn')
              ) {
                collected.push(`console.${type}: ${text}`)
              }
            },
          ],
          [
            'response',
            (response: {
              status: () => number
              url: () => string
              request: () => { method: () => string }
            }) => {
              if (
                oracles.http === false ||
                response.status() < oracles.http ||
                mockedRequests.has(response.request())
              ) {
                return
              }
              collected.push(
                `HTTP ${response.status()} ${response.request().method()} ${response.url()}`,
              )
            },
          ],
        )
        for (const [event, listener] of listeners) {
          page.on(event, listener)
        }
      }
      const tracing = trace === 'off' ? undefined : page.context?.().tracing
      const startTracing = tracing?.start
      const session = {
        tracingStarted: false,
        appliedCase: undefined as string | undefined,
        checkpoints: 0,
      }
      return Promise.resolve(
        installRejectionScript
          ? page.addInitScript?.(REJECTION_SCRIPT)
          : undefined,
      )
        .then(() => {
          if (startTracing === undefined) {
            return
          }
          return startTracing({ screenshots: true, snapshots: true }).then(
            () => {
              session.tracingStarted = true
            },
            // Tracing is already running, for example from Playwright's own
            // `trace` setting; that trace records the run instead.
            () => {},
          )
        })
        .then(() => config.reset?.(page))
        .then(() => {
          const stepScreenshots: Uint8Array[] = []
          const installedRoutes: InstalledRoute[] = []
          const mockPage = trackRoutes(page, installedRoutes, mockedRequests)

          return {
            send: (
              event: TEvent,
              context?: TestSutSendContext<TSnapshot>,
            ) =>
              Effect.runPromise(Effect.gen(function*() {
                // The generated event case is authoritative when the property
                // runner supplies one; `caseOf` remains the fallback.
                const resolved = resolveMock(
                  config.mocks as
                    | Record<string, PlaywrightMock<TPage> | undefined>
                    | undefined,
                  context?.case,
                  caseOf(event),
                )
                if (
                  resolved !== undefined &&
                  resolved.key !== session.appliedCase
                ) {
                  // Remove the previous case's routes so its handlers stop
                  // intercepting before the new case's mock installs its own.
                  yield* awaited(releaseRoutes(page, installedRoutes))
                  yield* awaited(resolved.mock(mockPage))
                  session.appliedCase = resolved.key
                }
                const action = (
                  config.events as Record<
                    string,
                    PlaywrightEventAction<TPage, TEvent> | undefined
                  >
                )[event.type]
                if (action === undefined) {
                  throw new Error(
                    `No Playwright action configured for event "${event.type}"`,
                  )
                }
                if (config.step !== undefined) {
                  yield* awaited(
                    config.step(formatStepName(event), () => Promise.resolve(action(page, event))),
                  )
                  return
                }
                yield* awaited(action(page, event))
              })),
            ...(config.read !== undefined ? { read: () => config.read!(page) } : {}),
            ...(config.states !== undefined
              ? {
                states: Object.fromEntries(
                  Object.entries(config.states).map(([key, assertion]) => [
                    key,
                    (snapshot: TSnapshot) => assertion(page, snapshot),
                  ]),
                ) as unknown as TestStateAssertions<TSnapshot, TEvent>,
              }
              : {}),
            settle: () =>
              Effect.runPromise(Effect.gen(function*() {
                if (config.settle !== undefined) {
                  yield* awaited(config.settle(page))
                  return
                }
                yield* awaited(page.waitForLoadState?.('load'))
                // Lets listeners for events the page has already emitted run.
                yield* Effect.callback<void>((resume) => {
                  queueMicrotask(() => resume(Effect.void))
                })
              })),
            check: () =>
              Effect.runPromise(Effect.gen(function*() {
                if (screenshots === 'every-step') {
                  const shot = yield* awaited(page.screenshot?.())
                  if (shot !== undefined && shot !== null) {
                    stepScreenshots.push(shot)
                  }
                }
                if (collected.length !== 0) {
                  throw new PlaywrightOracleError(collected.splice(0))
                }
              })),
            advance: (milliseconds: number) =>
              Effect.runPromise(Effect.gen(function*() {
                if (config.advance !== undefined) {
                  return yield* awaited(config.advance(page, milliseconds))
                }
                yield* awaited(page.clock?.runFor?.(milliseconds))
                return []
              })),
            checkpoint: (label?: string) =>
              Effect.runPromise(Effect.gen(function*() {
                const resolved = label ?? `checkpoint-${session.checkpoints}`
                session.checkpoints++
                if (config.checkpoint !== undefined) {
                  yield* awaited(config.checkpoint(page, resolved))
                  return
                }
                yield* awaited(
                  page.screenshot?.({
                    path: `${screenshotDir}/${sanitizeLabel(resolved)}.png`,
                  }),
                )
              })),
            ...(config.stop !== undefined ? { stop: () => config.stop!(page) } : {}),
            dispose: ({ passed }: TestSutDisposeContext) =>
              Effect.runPromise(
                Effect.ensuring(
                  Effect.gen(function*() {
                    for (const [event, listener] of listeners) {
                      page.off?.(event, listener)
                    }
                    if (!passed) {
                      const screenshot = screenshots === 'on-failure'
                        ? yield* awaited(page.screenshot?.())
                        : undefined
                      let tracePath: string | undefined
                      if (session.tracingStarted) {
                        // Every failing run overwrites the same file, so the file
                        // left is the last failing run's: the shrunk counterexample.
                        tracePath = testInfo!.outputPath(
                          'xstate-test-failure-trace.zip',
                        )
                        yield* awaited(tracing!.stop!({ path: tracePath }))
                      }
                      lastFailure = {
                        ...(tracePath !== undefined ? { trace: tracePath } : {}),
                        ...(screenshot !== undefined && screenshot !== null
                          ? { screenshot }
                          : {}),
                        steps: stepScreenshots.slice(),
                      }
                    } else if (session.tracingStarted) {
                      if (trace === 'on') {
                        // Each passing run overwrites the last one's trace.
                        lastPassingTrace = testInfo!.outputPath(
                          'xstate-test-trace.zip',
                        )
                        yield* awaited(tracing!.stop!({ path: lastPassingTrace }))
                      } else {
                        yield* awaited(tracing!.stop!())
                      }
                    }
                    yield* awaited(releaseRoutes(page, installedRoutes))
                  }),
                  Effect.promise(() => Promise.resolve(config.dispose?.(page))),
                ),
              ),
          }
        })
    },
    complete: ({ passed, failure }: TestSutCompleteContext) =>
      Effect.runPromise(Effect.gen(function*() {
        const artifacts = lastFailure
        const passingTrace = lastPassingTrace
        lastFailure = undefined
        lastPassingTrace = undefined
        if (testInfo === undefined) {
          return
        }
        if (passed) {
          if (passingTrace !== undefined) {
            yield* awaited(testInfo.attach('trace', {
              path: passingTrace,
              contentType: 'application/zip',
            }))
          }
          return
        }
        const fixture = (failure as { fixture?: TestFixture } | undefined)
          ?.fixture
        if (fixture !== undefined) {
          yield* awaited(testInfo.attach('fixture.json', {
            body: fixtureJson(fixture),
            contentType: 'application/json',
          }))
        }
        if (artifacts?.trace !== undefined) {
          yield* awaited(testInfo.attach('trace', {
            path: artifacts.trace,
            contentType: 'application/zip',
          }))
        }
        if (artifacts?.screenshot !== undefined) {
          yield* awaited(testInfo.attach('failure.png', {
            body: artifacts.screenshot,
            contentType: 'image/png',
          }))
        }
        for (const [index, shot] of (artifacts?.steps ?? []).entries()) {
          yield* awaited(testInfo.attach(`step-${index}.png`, {
            body: shot,
            contentType: 'image/png',
          }))
        }
      })),
  }
})
