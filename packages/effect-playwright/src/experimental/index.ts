/**
 * Experimental `@systemfsoftware/effect-playwright` APIs.
 *
 * These APIs may change without the compatibility guarantees of the main
 * package entrypoint.
 */

import * as BrowserUtils from '../api/experimental/browser-utils.js'

export { BrowserUtils }

export { allFrameNavigatedEventStream, allFrames, allPages } from '../api/experimental/browser-utils.js'
