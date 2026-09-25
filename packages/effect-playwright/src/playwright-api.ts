/**
 * Effect services and value wrappers for Playwright browser automation.
 *
 * Service names such as {@link Browser}, {@link BrowserContext}, and
 * {@link Page} work in both value and type positions. Constructors adapt
 * native Playwright values, and {@link Playwright} provides browser launch and
 * connection operations.
 */

export { BrowserContext, type BrowserContextEventMap, type InitScript } from './browser-context.js'
export {
  Browser,
  type BrowserEventMap,
  type LaunchOptions,
  type NewContextOptions,
  type NewPageOptions,
} from './browser.js'
export { Clock, makeClock } from './clock.js'
export { Dialog, Download, FileChooser, Request, Response, Worker, type WorkerEvaluateFunction } from './common.js'
export { Credentials, makeCredentials } from './credentials.js'
export { PlaywrightError, type PlaywrightErrorReason } from './errors.schema.js'
export { FrameLocator } from './frame-locator.js'
export { Frame } from './frame.js'
export { Keyboard, makeKeyboard } from './keyboard.js'
export { Locator, type LocatorEvaluateAllFunction, type LocatorEvaluateFunction } from './locator.js'
export { makeMouse, Mouse } from './mouse.js'
export { Page, type PageEvaluateFunction, type PageEventMap } from './page.js'
export type { NoHandles, PageFunction, PatchedEvents, Unboxed } from './playwright-types.js'
export { layer, Playwright } from './playwright.js'
export { makeScreencast, Screencast } from './screencast.js'
export { makeTouchscreen, Touchscreen } from './touchscreen.js'
export { makeTracing, Tracing } from './tracing.js'
export { makeWebStorage, WebStorage } from './web-storage.js'
export {
  makeBrowser,
  makeBrowserContext,
  makeDialog,
  makeDownload,
  makeFileChooser,
  makeFrame,
  makeFrameLocator,
  makeLocator,
  makePage,
  makeRequest,
  makeResponse,
  makeWorker,
} from './wrappers.js'
