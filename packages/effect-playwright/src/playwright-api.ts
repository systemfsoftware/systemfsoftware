/**
 * Effect services and value wrappers for Playwright browser automation.
 *
 * Service names such as `Browser`, `BrowserContext`, and `Page` work in both
 * value and type positions. Constructors adapt native Playwright values, and
 * `Playwright` provides browser launch and connection operations.
 *
 * @since 0.1.0
 */

export { BrowserContext, makeBrowserContext } from './internal/browser-context.js'
export {
  Browser,
  type LaunchOptions,
  makeBrowser,
  type NewContextOptions,
  type NewPageOptions,
} from './internal/browser.js'
export { Clock, makeClock } from './internal/clock.js'
export { Dialog, Download, FileChooser, Request, Response, Worker } from './internal/common.js'
export { Credentials, makeCredentials } from './internal/credentials.js'
export { PlaywrightError, type PlaywrightErrorReason } from './internal/errors.js'
export { FrameLocator, makeFrameLocator } from './internal/frame-locator.js'
export { Frame, makeFrame } from './internal/frame.js'
export { Keyboard, makeKeyboard } from './internal/keyboard.js'
export { Locator, makeLocator } from './internal/locator.js'
export { makeMouse, Mouse } from './internal/mouse.js'
export { makePage, Page, type PageEventMap } from './internal/page.js'
export type { NoHandles, PageFunction, Unboxed } from './internal/playwright-types.js'
export { layer, Playwright } from './internal/playwright.js'
export { makeScreencast, Screencast } from './internal/screencast.js'
export { makeTouchscreen, Touchscreen } from './internal/touchscreen.js'
export { makeTracing, Tracing } from './internal/tracing.js'
export { makeWebStorage, WebStorage } from './internal/web-storage.js'
