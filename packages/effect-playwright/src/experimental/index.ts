/**
 * Experimental `@systemfsoftware/effect-playwright` APIs.
 *
 * These APIs may change without the compatibility guarantees of the main
 * package entrypoint.
 *
 * @since 0.1.0
 */

import * as BrowserUtils from '../internal/experimental/browser-utils.js'

export { BrowserUtils }

export { allFrameNavigatedEventStream, allFrames, allPages } from '../internal/experimental/browser-utils.js'
