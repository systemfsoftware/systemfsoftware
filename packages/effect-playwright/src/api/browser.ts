/**
 * Effect service wrapper for Playwright browsers, including scoped context and
 * page creation, lifecycle operations, and browser event streams.
 */

import { Context, Effect, Queue, Stream } from 'effect'
import type { Scope } from 'effect/Scope'
import type {
  Browser as CoreBrowser,
  BrowserContext as CoreBrowserContext,
  BrowserType,
  chromium,
} from 'playwright-core'
import { type BrowserContext, makeBrowserContext } from './browser-context.js'
import type { PlaywrightError } from './errors.js'
import { makePage, type Page } from './page.js'
import type { PatchedEvents } from './playwright-types.js'
import { useHelper } from './utils.js'

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

type BrowserMapped = {
  disconnected: Browser
  context: BrowserContext
}

const eventMappings: {
  [K in keyof BrowserEvents]: (value: BrowserEvents[K]) => BrowserMapped[K]
} = {
  disconnected: (browser) => makeBrowser(browser),
  context: (context) => makeBrowserContext(context),
}

type BrowserWithPatchedEvents = PatchedEvents<CoreBrowser, BrowserEvents>

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
  ) => Effect.Effect<BrowserContext, PlaywrightError, Scope>

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
   *
   * @see {@link CoreBrowser.on}
   */
  readonly eventStream: <K extends keyof BrowserEvents>(
    event: K,
  ) => Stream.Stream<BrowserMapped[K]>
}

/**
 * Service tag for the active {@link Browser}.
 */

export const Browser = Context.Service<Browser>(
  'effect-playwright/browser/Browser',
)

/**
 * Creates a `Browser` from a Playwright `Browser` instance.
 *
 * @param browser - The Playwright `Browser` instance to wrap.
 */
export const makeBrowser = (browser: CoreBrowser): Browser => {
  const events = browser as BrowserWithPatchedEvents
  const use = useHelper(browser)

  return Browser.of({
    newPage: (options) => use((browser) => browser.newPage(options).then(makePage)),
    close: use((browser) => browser.close()),
    contexts: () => browser.contexts().map(makeBrowserContext),
    newContext: (options) =>
      Effect.acquireRelease(
        use((browser) => browser.newContext(options).then(makeBrowserContext)),
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
      }).pipe(Stream.map((value) => eventMappings[event](value))),
    use,
  })
}
