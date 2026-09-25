/**
 * Effect service wrapper for Playwright browser contexts, including pages,
 * storage state, tracing, credentials, and event streams.
 */

import { Context, Effect, Option, Queue, Stream } from 'effect'
import { dual } from 'effect/Function'
import type {
  BrowserContext as CoreBrowserContext,
  ConsoleMessage,
  Dialog as CoreDialog,
  Download as CoreDownload,
  Frame as CoreFrame,
  Page as CorePage,
  Request as CoreRequest,
  Response as CoreResponse,
  WebError,
  Worker as CoreWorker,
} from 'playwright-core'
import type { Browser } from './browser.js'
import { type Clock, makeClock } from './clock.js'
import type { Dialog, Download, Request, Response, Worker } from './common.js'
import { type Credentials, makeCredentials } from './credentials.js'
import type { PlaywrightError } from './errors.schema.js'
import type { Frame } from './frame.js'
import type { Page } from './page.js'
import { patchedEvents } from './playwright-types.js'
import { makeTracing, type Tracing } from './tracing.js'
import { useHelper } from './utils.js'
import type { Wrappers } from './wrappers.js'

declare const coreAddInitScript: CoreBrowserContext['addInitScript']

/**
 * The script argument accepted by {@link BrowserContext.addInitScript}.
 */
export type InitScript<Arg> = Parameters<typeof coreAddInitScript<Arg>>[0]

interface BrowserContextEvents {
  /** @deprecated Since Playwright 1.56.0. This event is no longer emitted. */
  backgroundpage: CorePage
  close: CoreBrowserContext
  console: ConsoleMessage
  dialog: CoreDialog
  download: CoreDownload
  frameattached: CoreFrame
  framedetached: CoreFrame
  framenavigated: CoreFrame
  page: CorePage
  pageclose: CorePage
  pageload: CorePage
  request: CoreRequest
  requestfailed: CoreRequest
  requestfinished: CoreRequest
  response: CoreResponse
  serviceworker: CoreWorker
  weberror: WebError
}

/**
 * Values emitted by {@link BrowserContext.eventStream} for each supported
 * browser-context event. Native Playwright values are converted to Effect
 * Playwright wrappers where a wrapper is available.
 */
export interface BrowserContextEventMap {
  readonly backgroundpage: Page
  readonly close: BrowserContext
  readonly console: ConsoleMessage
  readonly dialog: Dialog
  readonly download: Download
  readonly frameattached: Frame
  readonly framedetached: Frame
  readonly framenavigated: Frame
  readonly page: Page
  readonly pageclose: Page
  readonly pageload: Page
  readonly request: Request
  readonly requestfailed: Request
  readonly requestfinished: Request
  readonly response: Response
  readonly serviceworker: Worker
  readonly weberror: WebError
}

const eventMappings: {
  readonly [K in keyof BrowserContextEvents]: (
    wrap: Wrappers,
    value: BrowserContextEvents[K],
  ) => BrowserContextEventMap[K]
} = {
  backgroundpage: (wrap, page) => wrap.page(page),
  close: (wrap, context) => wrap.browserContext(context),
  console: (_wrap, message) => message,
  dialog: (wrap, dialog) => wrap.dialog(dialog),
  download: (wrap, download) => wrap.download(download),
  frameattached: (wrap, frame) => wrap.frame(frame),
  framedetached: (wrap, frame) => wrap.frame(frame),
  framenavigated: (wrap, frame) => wrap.frame(frame),
  page: (wrap, page) => wrap.page(page),
  pageclose: (wrap, page) => wrap.page(page),
  pageload: (wrap, page) => wrap.page(page),
  request: (wrap, request) => wrap.request(request),
  requestfailed: (wrap, request) => wrap.request(request),
  requestfinished: (wrap, request) => wrap.request(request),
  response: (wrap, response) => wrap.response(response),
  serviceworker: (wrap, worker) => wrap.worker(worker),
  weberror: (_wrap, error) => error,
}

/**
 * Effect-friendly operations for an isolated Playwright browser context.
 *
 * **When to use**
 *
 * Use a context to isolate cookies, permissions, storage, pages, and tracing
 * within one browser. Contexts created by `Browser.newContext` are scoped and
 * close automatically when their scope ends.
 */
export interface BrowserContext {
  /**
   * Access the clock.
   */
  readonly clock: Clock
  /**
   * Access the virtual WebAuthn credentials manager.
   *
   * @see {@link CoreBrowserContext.credentials}
   */
  readonly credentials: Credentials
  /**
   * Access the tracing.
   */
  readonly tracing: Tracing
  /**
   * Returns the list of all open pages in the browser context.
   *
   * @see {@link CoreBrowserContext.pages}
   */
  readonly pages: () => Array<Page>
  /**
   * Opens a new page in the browser context.
   * @see {@link CoreBrowserContext.newPage}
   */
  readonly newPage: Effect.Effect<Page, PlaywrightError>
  /**
   * Closes the browser context.
   *
   * @see {@link CoreBrowserContext.close}
   */
  readonly close: Effect.Effect<void, PlaywrightError>
  /**
   * Indicates that the browser context is in the process of closing or has already been closed.
   *
   * @see {@link CoreBrowserContext.isClosed}
   */
  readonly isClosed: () => boolean
  /**
   * Adds a script which would be evaluated in one of the following scenarios:
   * - Whenever a page is created in the browser context or is navigated.
   * - Whenever a child frame is attached or navigated. In this case, the script is evaluated in the context of the newly attached frame.
   *
   * @see {@link CoreBrowserContext.addInitScript}
   */
  readonly addInitScript: <Arg>(
    script: InitScript<Arg>,
    arg?: Arg,
    options?: Parameters<CoreBrowserContext['addInitScript']>[2],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Returns the browser that the context belongs to.
   *
   * @see {@link CoreBrowserContext.browser}
   */
  readonly browser: () => Option.Option<Browser>

  /**
   * Clears the cookies from the browser context.
   *
   * @see {@link CoreBrowserContext.clearCookies}
   */
  readonly clearCookies: (options?: {
    name?: string | RegExp
    domain?: string | RegExp
    path?: string | RegExp
  }) => Effect.Effect<void, PlaywrightError>

  /**
   * Clears the permissions from the browser context.
   *
   * @see {@link CoreBrowserContext.clearPermissions}
   */
  readonly clearPermissions: Effect.Effect<void, PlaywrightError>

  /**
   * Returns the cookies for the browser context.
   *
   * @see {@link CoreBrowserContext.cookies}
   */
  readonly cookies: (
    urls?: string | string[],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreBrowserContext['cookies']>>,
    PlaywrightError
  >

  /**
   * Sets the cookies for the browser context.
   *
   * @see {@link CoreBrowserContext.addCookies}
   */
  readonly addCookies: (
    cookies: Parameters<CoreBrowserContext['addCookies']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Grants permissions to the browser context.
   *
   * @see {@link CoreBrowserContext.grantPermissions}
   */
  readonly grantPermissions: (
    permissions: Parameters<CoreBrowserContext['grantPermissions']>[0],
    options?: Parameters<CoreBrowserContext['grantPermissions']>[1],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Sets the extra HTTP headers for the browser context.
   *
   * @see {@link CoreBrowserContext.setExtraHTTPHeaders}
   */
  readonly setExtraHTTPHeaders: (
    headers: Parameters<CoreBrowserContext['setExtraHTTPHeaders']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Sets the geolocation for the browser context.
   *
   * @see {@link CoreBrowserContext.setGeolocation}
   */
  readonly setGeolocation: (
    geolocation: Parameters<CoreBrowserContext['setGeolocation']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Sets the offline state for the browser context.
   *
   * @see {@link CoreBrowserContext.setOffline}
   */
  readonly setOffline: (
    offline: boolean,
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Sets the default navigation timeout for the browser context.
   *
   * @see {@link CoreBrowserContext.setDefaultNavigationTimeout}
   */
  readonly setDefaultNavigationTimeout: (timeout: number) => void

  /**
   * Sets the default timeout for the browser context.
   *
   * @see {@link CoreBrowserContext.setDefaultTimeout}
   */
  readonly setDefaultTimeout: (timeout: number) => void

  /**
   * Returns storage state for this browser context, contains current cookies, local storage snapshot and IndexedDB
   * snapshot.
   *
   * @see {@link CoreBrowserContext.storageState}
   */
  readonly storageState: (
    options?: Parameters<CoreBrowserContext['storageState']>[0],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreBrowserContext['storageState']>>,
    PlaywrightError
  >

  /**
   * Sets the storage state for the browser context.
   *
   * @see {@link CoreBrowserContext.setStorageState}
   */
  readonly setStorageState: (
    options: Parameters<CoreBrowserContext['setStorageState']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Streams browser-context events after adapting their payloads to wrapper
   * values.
   *
   * **Details**
   *
   * Event listeners are removed when stream consumption ends. The stream also
   * ends when the browser context closes.
   * @see {@link CoreBrowserContext.on}
   */
  readonly eventStream: <K extends keyof BrowserContextEventMap>(
    event: K,
  ) => Stream.Stream<BrowserContextEventMap[K]>
}

/**
 * Service for the active {@link BrowserContext}.
 */
export const BrowserContext = Context.Service<BrowserContext>(
  'effect-playwright/browser-context/BrowserContext',
)

/**
 * Creates a `BrowserContext` from a Playwright `BrowserContext` instance.
 *
 * @param context - The Playwright `BrowserContext` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildBrowserContext: {
  (context: CoreBrowserContext, wrap: Wrappers): BrowserContext
  (wrap: Wrappers): (context: CoreBrowserContext) => BrowserContext
} = dual(2, (context: CoreBrowserContext, wrap: Wrappers): BrowserContext => {
  const events = patchedEvents<CoreBrowserContext, BrowserContextEvents>(context)
  const use = useHelper(context)
  return BrowserContext.of({
    clock: makeClock(context.clock),
    credentials: makeCredentials(context.credentials),
    tracing: makeTracing(context.tracing),
    pages: () => context.pages().map(wrap.page),
    newPage: use((c) => c.newPage().then(wrap.page)),
    close: use((c) => c.close()),
    isClosed: () => context.isClosed(),
    addInitScript: <Arg>(
      script: InitScript<Arg>,
      arg?: Arg,
      options?: Parameters<CoreBrowserContext['addInitScript']>[2],
    ) => use((c) => c.addInitScript<Arg>(script, arg, options)).pipe(Effect.asVoid),
    browser: () => Option.fromNullishOr(context.browser()).pipe(Option.map(wrap.browser)),
    clearCookies: (options) => use((c) => c.clearCookies(options)),
    clearPermissions: use((c) => c.clearPermissions()),
    cookies: (urls) => use((c) => c.cookies(urls)),
    addCookies: (cookies) => use((c) => c.addCookies(cookies)),
    grantPermissions: (permissions, options) => use((c) => c.grantPermissions(permissions, options)),
    setExtraHTTPHeaders: (headers) => use((c) => c.setExtraHTTPHeaders(headers)),
    setGeolocation: (geolocation) => use((c) => c.setGeolocation(geolocation)),
    setOffline: (offline) => use((c) => c.setOffline(offline)),
    setDefaultNavigationTimeout: (timeout) => context.setDefaultNavigationTimeout(timeout),
    setDefaultTimeout: (timeout) => context.setDefaultTimeout(timeout),
    storageState: (options) => use((c) => c.storageState(options)),
    setStorageState: (options) => use((c) => c.setStorageState(options)),
    eventStream: <K extends keyof BrowserContextEventMap>(event: K) =>
      Stream.callback<BrowserContextEvents[K]>((queue) => {
        const emit = (value: BrowserContextEvents[K]) => {
          Queue.offerUnsafe(queue, value)
        }
        const end = () => {
          Queue.endUnsafe(queue)
        }
        return Effect.acquireRelease(
          Effect.sync(() => {
            events.on(event, emit)
            events.once('close', end)
          }),
          () =>
            Effect.sync(() => {
              events.off(event, emit)
              events.off('close', end)
            }),
        )
      }).pipe(Stream.map((value) => eventMappings[event](wrap, value))),
  })
})
