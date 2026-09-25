/**
 * Effect service wrapper for Playwright pages, including navigation, DOM
 * interaction, evaluation, media capture, and event streams.
 */

import { Array, Context, Effect, identity, Option, Queue, Stream } from 'effect'
import { dual } from 'effect/Function'
import type {
  ConsoleMessage,
  Dialog as CoreDialog,
  Download as CoreDownload,
  ElementHandle,
  FileChooser as CoreFileChooser,
  Frame as CoreFrame,
  Page as CorePage,
  Request as CoreRequest,
  Response as CoreResponse,
  WebSocket,
  Worker as CoreWorker,
} from 'playwright-core'
import type { BrowserContext, InitScript } from './browser-context.js'
import { type Clock, makeClock } from './clock.js'
import type { Dialog, Download, FileChooser, Request, Response, Worker } from './common.js'
import type { PlaywrightError } from './errors.schema.js'
import type { Frame } from './frame.js'
import { type Keyboard, makeKeyboard } from './keyboard.js'
import type { Locator } from './locator.js'
import { makeMouse, type Mouse } from './mouse.js'
import { patchedEvents } from './playwright-types.js'
import { makeScreencast, type Screencast } from './screencast.js'
import { makeTouchscreen, type Touchscreen } from './touchscreen.js'
import { useHelper } from './utils.js'
import { makeWebStorage, type WebStorage } from './web-storage.js'
import type { Wrappers } from './wrappers.js'

interface CorePageEventMap {
  close: CorePage
  console: ConsoleMessage
  crash: CorePage
  dialog: CoreDialog
  domcontentloaded: CorePage
  download: CoreDownload
  filechooser: CoreFileChooser
  frameattached: CoreFrame
  framedetached: CoreFrame
  framenavigated: CoreFrame
  load: CorePage
  pageerror: Error
  popup: CorePage
  request: CoreRequest
  requestfailed: CoreRequest
  requestfinished: CoreRequest
  response: CoreResponse
  websocket: WebSocket
  worker: CoreWorker
}
/**
 * Values emitted by {@link Page.eventStream} for each supported page event.
 * Native Playwright values are converted to Effect Playwright wrappers where
 * a wrapper is available.
 */
export interface PageEventMap {
  readonly close: Page
  readonly console: ConsoleMessage
  readonly crash: Page
  readonly dialog: Dialog
  readonly domcontentloaded: Page
  readonly download: Download
  readonly filechooser: FileChooser
  readonly frameattached: Frame
  readonly framedetached: Frame
  readonly framenavigated: Frame
  readonly load: Page
  readonly pageerror: Error
  readonly popup: Page
  readonly request: Request
  readonly requestfailed: Request
  readonly requestfinished: Request
  readonly response: Response
  readonly websocket: WebSocket
  readonly worker: Worker
}

declare const corePageEvaluate: CorePage['evaluate']

/**
 * The page function argument accepted by {@link Page.evaluate} and
 * {@link Frame.evaluate}.
 */
export type PageEvaluateFunction<Arg, R> = Parameters<typeof corePageEvaluate<R, Arg>>[0]

/**
 * Widens an omitted argument to the required slot Playwright's evaluated-function
 * overload asks for: playwright-core types the argument positionally even when the
 * evaluated function takes none.
 */
function assertEvaluateArg<Arg>(_value: Arg | undefined): asserts _value is Arg {}

/**
 * Effect-friendly operations for a Playwright page.
 *
 * **When to use**
 *
 * Use this service for navigation, DOM interaction, evaluation, page state,
 * and page event streams. Operations that can fail return `Effect`; safe
 * synchronous observations remain plain functions, and nullable Playwright
 * results are represented with `Option`.
 */
export interface Page {
  /**
   * Access the clock.
   */
  readonly clock: Clock
  /**
   * Access local storage for the page's current origin.
   *
   * @see {@link CorePage.localStorage}
   */
  readonly localStorage: WebStorage
  /**
   * Access the keyboard.
   */
  readonly keyboard: Keyboard
  /**
   * Access the mouse.
   */
  readonly mouse: Mouse
  /**
   * Access the touchscreen.
   */
  readonly touchscreen: Touchscreen
  /**
   * Access the screencast.
   */
  readonly screencast: Screencast
  /**
   * Access session storage for the page's current origin.
   *
   * @see {@link CorePage.sessionStorage}
   */
  readonly sessionStorage: WebStorage
  /**
   * Navigates the page to the given URL.
   * @see {@link CorePage.goto}
   */
  readonly goto: (
    url: string,
    options?: Parameters<CorePage['goto']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * This method internally calls [document.write()](https://developer.mozilla.org/en-US/docs/Web/API/Document/write),
   * inheriting all its specific characteristics and behaviors.
   *
   * @see {@link CorePage.setContent}
   */
  readonly setContent: (
    html: string,
    options?: Parameters<CorePage['setContent']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Waits for the given timeout in milliseconds.
   *
   * @see {@link CorePage.waitForTimeout}
   */
  readonly waitForTimeout: (
    timeout: number,
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * This setting will change the default maximum navigation time for the following methods:
   * - {@link Page.goBack}
   * - {@link Page.goForward}
   * - {@link Page.goto}
   * - {@link Page.reload}
   * - {@link Page.setContent}
   * - {@link Page.waitForURL}
   *
   * @see {@link CorePage.setDefaultNavigationTimeout}
   */
  readonly setDefaultNavigationTimeout: (
    timeout: Parameters<CorePage['setDefaultNavigationTimeout']>[0],
  ) => void
  /**
   * This setting will change the default maximum time for all the methods accepting `timeout` option.
   *
   * @see {@link CorePage.setDefaultTimeout}
   */
  readonly setDefaultTimeout: (
    timeout: Parameters<CorePage['setDefaultTimeout']>[0],
  ) => void
  /**
   * The extra HTTP headers will be sent with every request the page initiates.
   *
   * @see {@link CorePage.setExtraHTTPHeaders}
   */
  readonly setExtraHTTPHeaders: (
    headers: Parameters<CorePage['setExtraHTTPHeaders']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Sets the viewport size for the page.
   *
   * @see {@link CorePage.setViewportSize}
   */
  readonly setViewportSize: (
    viewportSize: Parameters<CorePage['setViewportSize']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Returns the viewport size.
   *
   * @see {@link CorePage.viewportSize}
   */
  readonly viewportSize: () => Option.Option<{ width: number; height: number }>
  /**
   * Waits for the page to navigate to the given URL.
   * @see {@link CorePage.waitForURL}
   */
  readonly waitForURL: (
    url: Parameters<CorePage['waitForURL']>[0],
    options?: Parameters<CorePage['waitForURL']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Waits for the page to reach the given load state.
   *
   * NOTE: Most of the time, this method is not needed because Playwright auto-waits before every action.
   * @see {@link CorePage.waitForLoadState}
   */
  readonly waitForLoadState: (
    state?: Parameters<CorePage['waitForLoadState']>[0],
    options?: Parameters<CorePage['waitForLoadState']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Evaluates a function in the context of the page.
   * **Example** (Evaluating browser-side code)
   *
   * ```ts
   * import { Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const dimensions = Effect.gen(function* () {
   *   const page = yield* Playwright.Page;
   *   return yield* page.evaluate(() => ({
   *     width: document.documentElement.clientWidth,
   *     height: document.documentElement.clientHeight,
   *   }));
   * });
   * ```
   * @see {@link CorePage.evaluate}
   */
  readonly evaluate: <R, Arg = void>(
    pageFunction: PageEvaluateFunction<Arg, R>,
    arg?: Arg,
    options?: Parameters<CorePage['evaluate']>[2],
  ) => Effect.Effect<R, PlaywrightError>
  /**
   * Adds a script which would be evaluated in one of the following scenarios:
   * - Whenever the page is navigated.
   * - Whenever the child frame is attached or navigated. In this case, the script is evaluated in the context of the newly attached frame.
   *
   * @see {@link CorePage.addInitScript}
   */
  readonly addInitScript: <Arg>(
    script: InitScript<Arg>,
    arg?: Arg,
    options?: Parameters<CorePage['addInitScript']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Adds a `<script>` tag into the page with the desired url or content.
   *
   * @see {@link CorePage.addScriptTag}
   */
  readonly addScriptTag: (
    options: Parameters<CorePage['addScriptTag']>[0],
  ) => Effect.Effect<ElementHandle, PlaywrightError>
  /**
   * Adds a function called `name` on the `window` object of every frame in this page.
   *
   * The provided function must return an `Effect` which will be executed using the
   * current runtime when the function is called from the browser context.
   *
   * If you don't require your function to have args you can use {@link exposeEffect} instead.
   *
   * @example
   * ```ts
   * import { Console, Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const browser = yield* Playwright.Browser;
   *   const page = yield* browser.newPage();
   *
   *   // Expose an Effect-based function to the browser
   *   yield* page.exposeFunction("logMessage", (message: string) =>
   *     Console.log(`Message from browser: ${message}`),
   *   );
   *
   *   yield* page.evaluate(() => {
   *     // Call the exposed function from the browser context
   *     // @ts-expect-error
   *     return window.logMessage("Hello from the other side!");
   *   });
   * });
   * ```
   *
   * @example
   * ```ts
   * import { Context, Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * // A custom Database service used in your Effect application
   * class Database extends Context.Service<
   *   Database,
   *   { readonly insertProduct: (name: string, price: number) => Effect.Effect<void> }
   * >()("Database") {}
   *
   * const program = Effect.gen(function* () {
   *   const browser = yield* Playwright.Browser;
   *   const page = yield* browser.newPage();
   *
   *   // Expose a function that seamlessly accesses Effect Context using Effect.fn
   *   yield* page.exposeFunction(
   *     "saveProduct",
   *     Effect.fn(function* (name: string, price: number) {
   *       const db = yield* Database;
   *       yield* db.insertProduct(name, price);
   *     }),
   *   );
   *
   *   yield* page.evaluate(async () => {
   *     // Extract data from the page and save it
   *     const items = document.querySelectorAll(".product");
   *     for (const item of items) {
   *       const name = item.querySelector(".name")?.textContent || "Unknown";
   *       const price = Number(item.querySelector(".price")?.textContent || 0);
   *
   *       // Call the Effect function directly from the browser
   *       // @ts-expect-error
   *       await window.saveProduct(name, price);
   *     }
   *   });
   * });
   * ```
   *
   * @see {@link CorePage.exposeFunction}
   */
  readonly exposeFunction: <A, E, R, Arg = unknown, Args extends ReadonlyArray<Arg> = ReadonlyArray<Arg>>(
    name: Parameters<CorePage['exposeFunction']>[0],
    playwrightFunction: (...args: Args) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, PlaywrightError, R>

  /**
   * Identical to {@link exposeFunction} but meant to be used with a static `Effect`.
   * This is useful when the exposed function does not need any arguments and just
   * runs a pre-defined effect in the application context.
   *
   * @example
   * ```ts
   * import { Console, Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const browser = yield* Playwright.Browser;
   *   const page = yield* browser.newPage();
   *
   *   yield* page.exposeEffect("ping", Console.log("pong"));
   *
   *   yield* page.evaluate(async () => {
   *     // @ts-expect-error
   *     await window.ping();
   *   });
   * });
   * ```
   *
   * @see {@link CorePage.exposeFunction}
   */
  readonly exposeEffect: <A, E, R>(
    name: Parameters<CorePage['exposeFunction']>[0],
    playwrightFunction: Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, PlaywrightError, R>
  /**
   * Adds a `<link rel="stylesheet">` tag into the page with the desired url or a `<style type="text/css">` tag with the content.
   *
   * @see {@link CorePage.addStyleTag}
   */
  readonly addStyleTag: (
    options: Parameters<CorePage['addStyleTag']>[0],
  ) => Effect.Effect<ElementHandle, PlaywrightError>
  /**
   * Returns the page title.
   * @see {@link CorePage.title}
   */
  readonly title: Effect.Effect<string, PlaywrightError>
  /**
   * Returns the full HTML contents of the page, including the doctype.
   * @see {@link CorePage.content}
   */
  readonly content: Effect.Effect<string, PlaywrightError>
  /**
   * Runs an asynchronous operation against the underlying Playwright `Page`.
   *
   * **When to use**
   *
   * Use this escape hatch only when {@link Page} does not expose the native
   * Playwright operation you need.
   *
   * **Gotchas**
   *
   * The callback must return a `Promise`. The native page has the same lifetime
   * as this wrapper; closing it also closes the wrapped page.
   *
   * @example
   * ```ts
   * import { Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const page = yield* Playwright.Page;
   *   return yield* page.use((nativePage) => nativePage.title());
   * });
   * ```
   *
   * @see {@link CorePage}
   */
  readonly use: <T>(
    f: (page: CorePage) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>
  /**
   * Returns a locator for the given selector.
   *
   * NOTE: This method will cause a defect if `options.has` or `options.hasNot` are provided and belong to a different frame.
   *
   * @see {@link CorePage.locator}
   */
  readonly locator: (
    selector: string,
    options?: Parameters<CorePage['locator']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given role.
   *
   * @see {@link CorePage.getByRole}
   */
  readonly getByRole: (
    role: Parameters<CorePage['getByRole']>[0],
    options?: Parameters<CorePage['getByRole']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given text.
   *
   * @see {@link CorePage.getByText}
   */
  readonly getByText: (
    text: Parameters<CorePage['getByText']>[0],
    options?: Parameters<CorePage['getByText']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given label.
   *
   * @see {@link CorePage.getByLabel}
   */
  readonly getByLabel: (
    label: Parameters<CorePage['getByLabel']>[0],
    options?: Parameters<CorePage['getByLabel']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given test id.
   *
   * @see {@link CorePage.getByTestId}
   */
  readonly getByTestId: (
    testId: Parameters<CorePage['getByTestId']>[0],
  ) => Locator
  /**
   * Returns a locator that matches the given alt text.
   *
   * @see {@link CorePage.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<CorePage['getByAltText']>[0],
    options?: Parameters<CorePage['getByAltText']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given placeholder.
   *
   * @see {@link CorePage.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<CorePage['getByPlaceholder']>[0],
    options?: Parameters<CorePage['getByPlaceholder']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given title.
   *
   * @see {@link CorePage.getByTitle}
   */
  readonly getByTitle: (
    text: Parameters<CorePage['getByTitle']>[0],
    options?: Parameters<CorePage['getByTitle']>[1],
  ) => Locator

  /**
   * Captures a screenshot of the page.
   *
   * @see {@link CorePage.screenshot}
   */
  readonly screenshot: (
    options?: Parameters<CorePage['screenshot']>[0],
  ) => Effect.Effect<Uint8Array, PlaywrightError>

  /**
   * Returns the PDF buffer.
   *
   * `page.pdf()` generates a pdf of the page with `print` css media. To generate a pdf with `screen` media, call
   * {@link Page.emulateMedia} before calling `page.pdf()`.
   *
   * @see {@link CorePage.pdf}
   */
  readonly pdf: (
    options?: Parameters<CorePage['pdf']>[0],
  ) => Effect.Effect<Uint8Array, PlaywrightError>

  /**
   * Clicks an element matching the given selector.
   *
   * @deprecated Use {@link Page.locator} to create a locator and then call `click` on it instead.
   * @see {@link CorePage.click}
   */
  readonly click: (
    selector: string,
    options?: Parameters<CorePage['click']>[1],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Drags a source element to a target element and drops it.
   *
   * @see {@link CorePage.dragAndDrop}
   */
  readonly dragAndDrop: (
    source: Parameters<CorePage['dragAndDrop']>[0],
    target: Parameters<CorePage['dragAndDrop']>[1],
    options?: Parameters<CorePage['dragAndDrop']>[2],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * This method changes the CSS media type through the media argument,
   * and/or the 'prefers-colors-scheme' media feature, using the colorScheme argument.
   *
   * @see {@link CorePage.emulateMedia}
   */
  readonly emulateMedia: (
    options?: Parameters<CorePage['emulateMedia']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Reloads the page.
   *
   * @see {@link CorePage.reload}
   */
  readonly reload: Effect.Effect<void, PlaywrightError>
  /**
   * Navigate to the previous page in history.
   *
   * @see {@link CorePage.goBack}
   */
  readonly goBack: (
    options?: Parameters<CorePage['goBack']>[0],
  ) => Effect.Effect<Option.Option<Response>, PlaywrightError>
  /**
   * Navigate to the next page in history.
   *
   * @see {@link CorePage.goForward}
   */
  readonly goForward: (
    options?: Parameters<CorePage['goForward']>[0],
  ) => Effect.Effect<Option.Option<Response>, PlaywrightError>
  /**
   * Request the page to perform garbage collection. Note that there is no guarantee that all unreachable objects will
   * be collected.
   *
   * @see {@link CorePage.requestGC}
   */
  readonly requestGC: Effect.Effect<void, PlaywrightError>
  /**
   * Brings page to front (activates tab).
   *
   * @see {@link CorePage.bringToFront}
   */
  readonly bringToFront: Effect.Effect<void, PlaywrightError>
  /**
   * Pauses the script execution.
   *
   * @see {@link CorePage.pause}
   */
  readonly pause: Effect.Effect<void, PlaywrightError>
  /**
   * Closes the page.
   *
   * @see {@link CorePage.close}
   */
  readonly close: Effect.Effect<void, PlaywrightError>
  /**
   * Indicates that the page has been closed.
   *
   * @see {@link CorePage.isClosed}
   */
  readonly isClosed: () => boolean

  /**
   * Returns the current URL of the page.
   *
   * @see {@link CorePage.url}
   */
  readonly url: () => string

  /**
   * Clears all highlights.
   *
   * @see {@link CorePage.hideHighlight}
   */
  readonly hideHighlight: Effect.Effect<void, PlaywrightError>

  /**
   * Clears stored console messages.
   *
   * @see {@link CorePage.clearConsoleMessages}
   */
  readonly clearConsoleMessages: Effect.Effect<void, PlaywrightError>

  /**
   * Clears stored page errors.
   *
   * @see {@link CorePage.clearPageErrors}
   */
  readonly clearPageErrors: Effect.Effect<void, PlaywrightError>

  /**
   * Returns all messages that have been logged to the console.
   *
   * @see {@link CorePage.consoleMessages}
   */
  readonly consoleMessages: (
    options?: Parameters<CorePage['consoleMessages']>[0],
  ) => Effect.Effect<ReadonlyArray<ConsoleMessage>, PlaywrightError>

  /**
   * Returns all errors that have been thrown in the page.
   *
   * @see {@link CorePage.pageErrors}
   */
  readonly pageErrors: (
    options?: Parameters<CorePage['pageErrors']>[0],
  ) => Effect.Effect<ReadonlyArray<Error>, PlaywrightError>

  /**
   * Returns the most recent network requests from the page.
   *
   * @see {@link CorePage.requests}
   */
  readonly requests: Effect.Effect<ReadonlyArray<Request>, PlaywrightError>

  /**
   * Enters an interactive mode where hovering over elements highlights them and shows the corresponding locator.
   *
   * @see {@link CorePage.pickLocator}
   */
  readonly pickLocator: Effect.Effect<Locator, PlaywrightError>

  /**
   * Cancels the locator picking mode.
   *
   * @see {@link CorePage.cancelPickLocator}
   */
  readonly cancelPickLocator: Effect.Effect<void, PlaywrightError>

  /**
   * Captures the aria snapshot of the page.
   *
   * @see {@link CorePage.ariaSnapshot}
   */
  readonly ariaSnapshot: (
    options?: Parameters<CorePage['ariaSnapshot']>[0],
  ) => Effect.Effect<string, PlaywrightError>

  /**
   * Returns all workers.
   *
   * @see {@link CorePage.workers}
   */
  readonly workers: () => ReadonlyArray<Worker>

  /**
   * Get the browser context that the page belongs to.
   *
   * @see {@link CorePage.context}
   */
  readonly context: () => BrowserContext
  /**
   * Returns the opener for popup pages and `Option.none` for others.
   *
   * If the opener has been closed already, returns `Option.none`.
   *
   * @see {@link CorePage.opener}
   */
  readonly opener: Effect.Effect<Option.Option<Page>, PlaywrightError>
  /**
   * Returns a frame matching the specified criteria.
   *
   * @see {@link CorePage.frame}
   */
  readonly frame: (
    frameSelector: Parameters<CorePage['frame']>[0],
  ) => Option.Option<Frame>

  /**
   * Returns all frames attached to the page.
   *
   * @see {@link CorePage.frames}
   */
  readonly frames: Effect.Effect<ReadonlyArray<Frame>, PlaywrightError>
  /**
   * The page's main frame. Page is guaranteed to have a main frame which persists during navigations.
   *
   * @see {@link CorePage.mainFrame}
   */
  readonly mainFrame: () => Frame
  /**
   * Streams page events after adapting supported payloads to wrapper values.
   *
   * **Details**
   *
   * Event listeners are removed when stream consumption ends. The stream also
   * ends when the page closes.
   *
   * **Example** (Reading the first console event)
   *
   * ```ts
   * import { Effect, Stream } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const firstConsoleMessage = Effect.gen(function* () {
   *   const page = yield* Playwright.Page;
   *   return yield* page.eventStream("console").pipe(Stream.runHead);
   * });
   * ```
   *
   * @see {@link CorePage.on}
   */
  readonly eventStream: <K extends keyof PageEventMap>(
    event: K,
  ) => Stream.Stream<PageEventMap[K]>
}

/**
 * Service for the active {@link Page}.
 */
export const Page = Context.Service<Page>('effect-playwright/page/Page')

/**
 * Creates a `Page` from a Playwright `Page` instance.
 *
 * @param page - The Playwright `Page` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildPage: {
  (page: CorePage, wrap: Wrappers): Page
  (wrap: Wrappers): (page: CorePage) => Page
} = dual(2, (page: CorePage, wrap: Wrappers): Page => {
  const events = patchedEvents<CorePage, CorePageEventMap>(page)
  const use = useHelper(page)
  const eventMappings: {
    readonly [K in keyof CorePageEventMap]: (value: CorePageEventMap[K]) => PageEventMap[K]
  } = {
    close: wrap.page,
    console: identity<ConsoleMessage>,
    crash: wrap.page,
    dialog: wrap.dialog,
    domcontentloaded: wrap.page,
    download: wrap.download,
    filechooser: wrap.fileChooser,
    frameattached: wrap.frame,
    framedetached: wrap.frame,
    framenavigated: wrap.frame,
    load: wrap.page,
    pageerror: identity<Error>,
    popup: wrap.page,
    request: wrap.request,
    requestfailed: wrap.request,
    requestfinished: wrap.request,
    response: wrap.response,
    websocket: identity<WebSocket>,
    worker: wrap.worker,
  }

  return Page.of({
    clock: makeClock(page.clock),
    localStorage: makeWebStorage(page.localStorage),
    keyboard: makeKeyboard(page.keyboard),
    mouse: makeMouse(page.mouse),
    touchscreen: makeTouchscreen(page.touchscreen),
    screencast: makeScreencast(page.screencast),
    sessionStorage: makeWebStorage(page.sessionStorage),
    goto: (url, options) => use((page) => page.goto(url, options)),
    setContent: (html, options) => use((page) => page.setContent(html, options)),
    waitForTimeout: (timeout) => use((page) => page.waitForTimeout(timeout)),
    setDefaultNavigationTimeout: (timeout) => page.setDefaultNavigationTimeout(timeout),
    setDefaultTimeout: (timeout) => page.setDefaultTimeout(timeout),
    setExtraHTTPHeaders: (headers) => use((page) => page.setExtraHTTPHeaders(headers)),
    setViewportSize: (viewportSize) => use((page) => page.setViewportSize(viewportSize)),
    viewportSize: () => Option.fromNullishOr(page.viewportSize()),
    waitForURL: (url, options) => use((page) => page.waitForURL(url, options)),
    waitForLoadState: (state, options) => use((page) => page.waitForLoadState(state, options)),
    title: use((page) => page.title()),
    content: use((page) => page.content()),
    evaluate: <R, Arg = void>(
      fn: PageEvaluateFunction<Arg, R>,
      arg?: Arg,
      options?: Parameters<CorePage['evaluate']>[2],
    ) =>
      use((page) => {
        assertEvaluateArg<Arg>(arg)
        return page.evaluate<R, Arg>(fn, arg, options)
      }),
    addInitScript: <Arg>(
      script: InitScript<Arg>,
      arg?: Arg,
      options?: Parameters<CorePage['addInitScript']>[2],
    ) => use((page) => page.addInitScript<Arg>(script, arg, options)).pipe(Effect.asVoid),
    addScriptTag: (options) => use((page) => page.addScriptTag(options)),
    addStyleTag: (options) => use((page) => page.addStyleTag(options)),
    exposeFunction: <A, E, R, Arg = unknown, Args extends ReadonlyArray<Arg> = ReadonlyArray<Arg>>(
      name: string,
      effectFn: (...args: Args) => Effect.Effect<A, E, R>,
    ) =>
      Effect.context<R>().pipe(
        Effect.map((context) => Effect.runPromiseWith(context)),
        Effect.flatMap((runPromise) =>
          use((page) => page.exposeFunction(name, (...args: Args) => runPromise(effectFn(...args))))
        ),
      ),
    exposeEffect: <A, E, R>(name: string, effectFn: Effect.Effect<A, E, R>) =>
      Effect.context<R>().pipe(
        Effect.map((context) => Effect.runPromiseWith(context)),
        Effect.flatMap((runPromise) => use((page) => page.exposeFunction(name, () => runPromise(effectFn)))),
      ),
    locator: (selector, options) => wrap.locator(page.locator(selector, options)),
    getByRole: (role, options) => wrap.locator(page.getByRole(role, options)),
    getByText: (text, options) => wrap.locator(page.getByText(text, options)),
    getByLabel: (label, options) => wrap.locator(page.getByLabel(label, options)),
    getByTestId: (testId) => wrap.locator(page.getByTestId(testId)),
    getByAltText: (text, options) => wrap.locator(page.getByAltText(text, options)),
    getByPlaceholder: (text, options) => wrap.locator(page.getByPlaceholder(text, options)),
    getByTitle: (text, options) => wrap.locator(page.getByTitle(text, options)),
    url: () => page.url(),
    hideHighlight: use((page) => page.hideHighlight()),
    clearConsoleMessages: use((page) => page.clearConsoleMessages()),
    clearPageErrors: use((page) => page.clearPageErrors()),
    consoleMessages: (options) => use((page) => page.consoleMessages(options)),
    pageErrors: (options) => use((page) => page.pageErrors(options)),
    requests: use((page) => page.requests()).pipe(
      Effect.map(Array.map(wrap.request)),
    ),
    pickLocator: use((page) => page.pickLocator().then(wrap.locator)),
    cancelPickLocator: use((page) => page.cancelPickLocator()),
    ariaSnapshot: (options) => use((page) => page.ariaSnapshot(options)),
    context: () => wrap.browserContext(page.context()),
    opener: use((page) => page.opener()).pipe(
      Effect.map(Option.fromNullishOr),
      Effect.map(Option.map(wrap.page)),
    ),
    workers: () => page.workers().map(wrap.worker),
    frame: (frameSelector) =>
      Option.fromNullishOr(page.frame(frameSelector)).pipe(
        Option.map(wrap.frame),
      ),
    frames: use((page) => Promise.resolve(page.frames().map(wrap.frame))),
    mainFrame: () => wrap.frame(page.mainFrame()),
    reload: use((page) => page.reload()),
    goBack: (options) =>
      use((page) => page.goBack(options)).pipe(
        Effect.map(Option.fromNullishOr),
        Effect.map(Option.map(wrap.response)),
      ),
    goForward: (options) =>
      use((page) => page.goForward(options)).pipe(
        Effect.map(Option.fromNullishOr),
        Effect.map(Option.map(wrap.response)),
      ),
    requestGC: use((page) => page.requestGC()),
    bringToFront: use((page) => page.bringToFront()),
    pause: use((page) => page.pause()),
    close: use((page) => page.close()),
    isClosed: () => page.isClosed(),
    screenshot: (options) => use((page) => page.screenshot(options)),
    pdf: (options) => use((page) => page.pdf(options)),
    dragAndDrop: (source, target, options) => use((page) => page.dragAndDrop(source, target, options)),
    click: (selector, options) => use((page) => page.click(selector, options)),
    emulateMedia: (options) => use((page) => page.emulateMedia(options)),
    eventStream: <K extends keyof CorePageEventMap>(event: K) =>
      Stream.callback<CorePageEventMap[K]>((queue) => {
        const emit = (value: CorePageEventMap[K]) => {
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
      }).pipe(Stream.map((value) => eventMappings[event](value))),
    use,
  })
})
