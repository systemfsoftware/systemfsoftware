/**
 * Effect service wrapper for Playwright browsers, including scoped context and
 * page creation, lifecycle operations, and browser event streams.
 */

import { Context, Effect, Queue, type Scope, Stream } from 'effect'
import { dual } from 'effect/Function'
import type {
  Browser as CoreBrowser,
  BrowserContext as CoreBrowserContext,
  BrowserType,
  chromium,
} from 'playwright-core'
import type { BrowserContext } from './browser-context.js'
import type { PlaywrightError } from './errors.schema.js'
import type { Page } from './page.js'
import { patchedEvents } from './playwright-types.js'
import { useHelper } from './utils.js'
import type { Wrappers } from './wrappers.js'

/**
 * Options for launching a Playwright browser.
 */
export type LaunchOptions = Parameters<typeof chromium.launch>[0]
/**
 * Options for creating a page directly from a browser.
 */
export type NewPageOptions = Parameters<CoreBrowser['newPage']>[0]
/**
 * Options for creating a browser context.
 */
export type NewContextOptions = Parameters<CoreBrowser['newContext']>[0]

interface BrowserEvents {
  disconnected: CoreBrowser
  context: CoreBrowserContext
}

/**
 * Values emitted by {@link Browser.eventStream} for each supported browser
 * event. Native Playwright values are converted to Effect Playwright wrappers
 * where a wrapper is available.
 */
export interface BrowserEventMap {
  readonly disconnected: Browser
  readonly context: BrowserContext
}

const eventMappings: {
  readonly [K in keyof BrowserEvents]: (
    wrap: Wrappers,
    value: BrowserEvents[K],
  ) => BrowserEventMap[K]
} = {
  disconnected: (wrap, browser) => wrap.browser(browser),
  context: (wrap, context) => wrap.browserContext(context),
}

/**
 * Effect-friendly operations for a running Playwright browser.
 *
 * **When to use**
 *
 * Use this service to create pages or isolated browser contexts, inspect the
 * browser, consume browser events, or access an unsupported native operation.
 * Prefer `Playwright.launchScoped` or `PlaywrightSpawner.withBrowser` when this
 * service owns the browser process.
 */
export interface Browser {
  /**
   * Opens a new page in the browser.
   * @param options - Optional options for creating the new page.
   * @returns An effect that resolves to a `Page` service.
   * @see {@link CoreBrowser.newPage}
   */
  readonly newPage: (
    options?: NewPageOptions,
  ) => Effect.Effect<Page, PlaywrightError>
  /**
   * Runs an asynchronous operation against the underlying Playwright `Browser`.
   *
   * **When to use**
   *
   * Use this escape hatch only when {@link Browser} does not expose the native
   * Playwright operation you need.
   *
   * **Gotchas**
   *
   * The callback must return a `Promise`. The browser remains owned by the
   * service that created it, so do not close it here when using scoped
   * acquisition.
   *
   * @example
   * ```ts
   * import { Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const browser = yield* Playwright.Browser;
   *   return yield* browser.use(async (nativeBrowser) =>
   *     nativeBrowser.version(),
   *   );
   * });
   * ```
   *
   * @param f - A function that receives the native browser and returns a promise.
   * @returns An effect that maps a rejected promise to `PlaywrightError`.
   * @see {@link CoreBrowser}
   */
  readonly use: <T>(
    f: (browser: CoreBrowser) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>
  /**
   * An Effect that closes the browser and all of its pages.
   * @see {@link CoreBrowser.close}
   */
  readonly close: Effect.Effect<void, PlaywrightError>

  /**
   * Returns the list of all open browser contexts.
   * @see {@link CoreBrowser.contexts}
   */
  readonly contexts: () => Array<BrowserContext>

  /**
   * Creates an isolated browser context managed by the current `Scope`.
   *
   * **Details**
   *
   * The context is closed automatically when the scope ends, including after
   * failure or interruption.
   *
   * @see {@link CoreBrowser.newContext}
   */
  readonly newContext: (
    options?: NewContextOptions,
  ) => Effect.Effect<BrowserContext, PlaywrightError, Scope.Scope>

  /**
   * Returns the browser type (chromium, firefox or webkit) that the browser belongs to.
   * @see {@link CoreBrowser.browserType}
   */
  readonly browserType: () => BrowserType

  /**
   * Returns the version of the browser.
   * @see {@link CoreBrowser.version}
   */
  readonly version: () => string
  /**
   * Returns whether the browser is connected.
   * @see {@link CoreBrowser.isConnected}
   */
  readonly isConnected: () => boolean

  /**
   * Binds the browser to a title.
   *
   * @see {@link CoreBrowser.bind}
   */
  readonly bind: (
    title: string,
    options?: Parameters<CoreBrowser['bind']>[1],
  ) => Effect.Effect<{ endpoint: string }, PlaywrightError>

  /**
   * Unbinds the browser.
   *
   * @see {@link CoreBrowser.unbind}
   */
  readonly unbind: Effect.Effect<void, PlaywrightError>

  /**
   * Streams browser events after adapting their payloads to wrapper values.
   *
   * **Details**
   *
   * Event listeners are removed when stream consumption ends. The stream also
   * ends when the browser disconnects.
   * @see {@link CoreBrowser.on}
   */
  readonly eventStream: <K extends keyof BrowserEventMap>(
    event: K,
  ) => Stream.Stream<BrowserEventMap[K]>
}

/**
 * Service for the active {@link Browser}.
 */
export const Browser = Context.Service<Browser>(
  'effect-playwright/browser/Browser',
)

/**
 * Creates a `Browser` from a Playwright `Browser` instance.
 *
 * @param browser - The Playwright `Browser` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildBrowser: {
  (browser: CoreBrowser, wrap: Wrappers): Browser
  (wrap: Wrappers): (browser: CoreBrowser) => Browser
} = dual(2, (browser: CoreBrowser, wrap: Wrappers): Browser => {
  const events = patchedEvents<CoreBrowser, BrowserEvents>(browser)
  const use = useHelper(browser)

  return Browser.of({
    newPage: (options) => use((browser) => browser.newPage(options).then(wrap.page)),
    close: use((browser) => browser.close()),
    contexts: () => browser.contexts().map(wrap.browserContext),
    newContext: (options) =>
      Effect.acquireRelease(
        use((browser) => browser.newContext(options).then(wrap.browserContext)),
        (context) => context.close.pipe(Effect.ignore({ log: true })),
      ),
    browserType: () => browser.browserType(),
    version: () => browser.version(),
    isConnected: () => browser.isConnected(),
    bind: (title, options) => use((browser) => browser.bind(title, options)),
    unbind: use((browser) => browser.unbind()),
    eventStream: <K extends keyof BrowserEvents>(event: K) =>
      Stream.callback<BrowserEvents[K]>((queue) => {
        const emit = (value: BrowserEvents[K]) => {
          Queue.offerUnsafe(queue, value)
        }
        const end = () => {
          Queue.endUnsafe(queue)
        }
        return Effect.acquireRelease(
          Effect.sync(() => {
            events.on(event, emit)
            events.once('disconnected', end)
          }),
          () =>
            Effect.sync(() => {
              events.off(event, emit)
              events.off('disconnected', end)
            }),
        )
      }).pipe(Stream.map((value) => eventMappings[event](wrap, value))),
    use,
  })
})
