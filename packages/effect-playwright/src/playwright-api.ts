/**
 * Effect services and value wrappers for Playwright browser automation.
 *
 * Service names such as `Browser`, `BrowserContext`, and `Page` work in both
 * value and type positions. Constructors adapt native Playwright values, and
 * `Playwright` provides browser launch and connection operations.
 */

export { BrowserContext, makeBrowserContext } from './api/browser-context.js'
export { Browser, type LaunchOptions, makeBrowser, type NewContextOptions, type NewPageOptions } from './api/browser.js'
export { Clock, makeClock } from './api/clock.js'
export { Dialog, Download, FileChooser, Request, Response, Worker } from './api/common.js'
export { Credentials, makeCredentials } from './api/credentials.js'
export { PlaywrightError, type PlaywrightErrorReason } from './api/errors.js'
export { FrameLocator, makeFrameLocator } from './api/frame-locator.js'
export { Frame, makeFrame } from './api/frame.js'
export { Keyboard, makeKeyboard } from './api/keyboard.js'
export { Locator, makeLocator } from './api/locator.js'
export { makeMouse, Mouse } from './api/mouse.js'
export { makePage, Page, type PageEventMap } from './api/page.js'
export type { NoHandles, PageFunction, Unboxed } from './api/playwright-types.js'
export { layer, Playwright } from './api/playwright.js'
export { makeScreencast, Screencast } from './api/screencast.js'
export { makeTouchscreen, Touchscreen } from './api/touchscreen.js'
export { makeTracing, Tracing } from './api/tracing.js'
export { makeWebStorage, WebStorage } from './api/web-storage.js'
