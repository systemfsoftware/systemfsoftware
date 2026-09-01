/**
 * Experimental utilities for traversing browser pages and frames and merging
 * frame-navigation event streams.
 */

import { Array, Effect, pipe, Stream } from 'effect'
import type { Browser } from '../browser.js'

/**
 * Returns all pages in the browser from all contexts.
 */
export const allPages = (browser: Browser) => Array.flatten(browser.contexts().map((context) => context.pages()))

/**
 * Returns all frames in the browser from all pages in all contexts.
 */
export const allFrames = (browser: Browser) =>
  Effect.all(allPages(browser).map((page) => page.frames)).pipe(
    Effect.map(Array.flatten),
  )

/**
 * Returns a stream of all framenavigated events for all current and future pages in the browser.
 * In all current contexts (but not future contexts).
 */
export const allFrameNavigatedEventStream = (browser: Browser) =>
  Effect.gen(function*() {
    const contexts = yield* Effect.succeed(browser.contexts())
    const pages = Array.flatten(contexts.map((c) => c.pages()))

    // listen for framenavigated for all current pages
    const currentPages = pages.map((page) => page.eventStream('framenavigated'))

    // and all future pages
    const newPages = pipe(
      contexts.map((c) => c.eventStream('page')),
      Stream.mergeAll({ concurrency: 'unbounded' }),
      Stream.flatMap((page) => page.eventStream('framenavigated'), {
        concurrency: 'unbounded',
      }),
    )

    return Stream.mergeAll([newPages, ...currentPages], {
      concurrency: 'unbounded',
    })
  }).pipe(Stream.unwrap)
