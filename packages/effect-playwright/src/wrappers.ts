/**
 * Dependency-injection knot for the cyclic wrapper modules.
 *
 * The wrapper modules (browser, browser-context, page, frame, frame-locator,
 * locator, common) reference each other, so each one exposes a `build*`
 * function that receives the shared {@link Wrappers} record instead of
 * importing its siblings by value. This module assembles that record and
 * re-exports the public `make*` constructors that consumers import.
 */

import type {
  Browser as CoreBrowser,
  BrowserContext as CoreBrowserContext,
  Dialog as CoreDialog,
  Download as CoreDownload,
  FileChooser as CoreFileChooser,
  Frame as CoreFrame,
  FrameLocator as CoreFrameLocator,
  Locator as CoreLocator,
  Page as CorePage,
  Request as CoreRequest,
  Response as CoreResponse,
  Worker as CoreWorker,
} from 'playwright-core'
import { type BrowserContext, buildBrowserContext } from './browser-context.js'
import { type Browser, buildBrowser } from './browser.js'
import {
  buildDialog,
  buildDownload,
  buildFileChooser,
  buildRequest,
  buildResponse,
  buildWorker,
  type Dialog,
  type Download,
  type FileChooser,
  type Request,
  type Response,
  type Worker,
} from './common.js'
import { buildFrameLocator, type FrameLocator } from './frame-locator.js'
import { buildFrame, type Frame } from './frame.js'
import { buildLocator, type Locator } from './locator.js'
import { buildPage, type Page } from './page.js'

/**
 * Constructors shared by the cyclic wrapper modules. Each member adapts a
 * native Playwright value to its Effect Playwright wrapper.
 */
export interface Wrappers {
  readonly browser: (browser: CoreBrowser) => Browser
  readonly browserContext: (context: CoreBrowserContext) => BrowserContext
  readonly page: (page: CorePage) => Page
  readonly frame: (frame: CoreFrame) => Frame
  readonly locator: (locator: CoreLocator) => Locator
  readonly frameLocator: (frameLocator: CoreFrameLocator) => FrameLocator
  readonly request: (request: CoreRequest) => Request
  readonly response: (response: CoreResponse) => Response
  readonly worker: (worker: CoreWorker) => Worker
  readonly dialog: (dialog: CoreDialog) => Dialog
  readonly fileChooser: (fileChooser: CoreFileChooser) => FileChooser
  readonly download: (download: CoreDownload) => Download
}

const wrappers: Wrappers = {
  browser: (browser) => buildBrowser(browser, wrappers),
  browserContext: (context) => buildBrowserContext(context, wrappers),
  page: (page) => buildPage(page, wrappers),
  frame: (frame) => buildFrame(frame, wrappers),
  locator: (locator) => buildLocator(locator, wrappers),
  frameLocator: (frameLocator) => buildFrameLocator(frameLocator, wrappers),
  request: (request) => buildRequest(request, wrappers),
  response: (response) => buildResponse(response, wrappers),
  worker: (worker) => buildWorker(worker, wrappers),
  dialog: (dialog) => buildDialog(dialog, wrappers),
  fileChooser: (fileChooser) => buildFileChooser(fileChooser, wrappers),
  download: (download) => buildDownload(download, wrappers),
}

/**
 * Creates a `Browser` from a Playwright `Browser` instance.
 */
export const makeBrowser = (browser: CoreBrowser): Browser => wrappers.browser(browser)

/**
 * Creates a `BrowserContext` from a Playwright `BrowserContext` instance.
 */
export const makeBrowserContext = (
  context: CoreBrowserContext,
): BrowserContext => wrappers.browserContext(context)

/**
 * Creates a `Page` from a Playwright `Page` instance.
 */
export const makePage = (page: CorePage): Page => wrappers.page(page)

/**
 * Creates a `Frame` from a Playwright `Frame` instance.
 */
export const makeFrame = (frame: CoreFrame): Frame => wrappers.frame(frame)

/**
 * Creates a `Locator` from a Playwright `Locator` instance.
 */
export const makeLocator = (locator: CoreLocator): Locator => wrappers.locator(locator)

/**
 * Creates a `FrameLocator` from a Playwright `FrameLocator` instance.
 */
export const makeFrameLocator = (
  frameLocator: CoreFrameLocator,
): FrameLocator => wrappers.frameLocator(frameLocator)

/**
 * Creates a `Request` from a Playwright `Request` instance.
 */
export const makeRequest = (request: CoreRequest): Request => wrappers.request(request)

/**
 * Creates a `Response` from a Playwright `Response` instance.
 */
export const makeResponse = (response: CoreResponse): Response => wrappers.response(response)

/**
 * Creates a `Worker` from a Playwright `Worker` instance.
 */
export const makeWorker = (worker: CoreWorker): Worker => wrappers.worker(worker)

/**
 * Creates a `Dialog` from a Playwright `Dialog` instance.
 */
export const makeDialog = (dialog: CoreDialog): Dialog => wrappers.dialog(dialog)

/**
 * Creates a `FileChooser` from a Playwright `FileChooser` instance.
 */
export const makeFileChooser = (
  fileChooser: CoreFileChooser,
): FileChooser => wrappers.fileChooser(fileChooser)

/**
 * Creates a `Download` from a Playwright `Download` instance.
 */
export const makeDownload = (download: CoreDownload): Download => wrappers.download(download)
