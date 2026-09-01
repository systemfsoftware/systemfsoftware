/**
 * Effect service wrapper for Playwright trace and HAR recording.
 */

import { Context, type Effect } from 'effect'
import type { Tracing as CoreTracing } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { useHelper } from './utils.js'

/** */
export interface Tracing {
  /**
   * Starts tracing.
   *
   * @see {@link CoreTracing.start}
   */
  readonly start: (
    options?: Parameters<CoreTracing['start']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Starts a new tracing chunk.
   *
   * @see {@link CoreTracing.startChunk}
   */
  readonly startChunk: (
    options?: Parameters<CoreTracing['startChunk']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Stops a tracing chunk.
   *
   * @see {@link CoreTracing.stopChunk}
   */
  readonly stopChunk: (
    options?: Parameters<CoreTracing['stopChunk']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Stops tracing.
   *
   * @see {@link CoreTracing.stop}
   */
  readonly stop: (
    options?: Parameters<CoreTracing['stop']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Starts HAR recording.
   *
   * @see {@link CoreTracing.startHar}
   */
  readonly startHar: (
    options: Parameters<CoreTracing['startHar']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Stops HAR recording.
   *
   * @see {@link CoreTracing.stopHar}
   */
  readonly stopHar: Effect.Effect<void, PlaywrightError>
}

/** */
export const Tracing = Context.Service<Tracing>(
  'effect-playwright/tracing/Tracing',
)

/**
 * Creates `Tracing` from a Playwright `Tracing` instance.
 *
 * @param tracing - The Playwright `Tracing` instance to wrap.
 */
export const makeTracing = (tracing: CoreTracing): Tracing => {
  const use = useHelper(tracing)
  return Tracing.of({
    start: (options) => use((t) => t.start(options)),
    startChunk: (options) => use((t) => t.startChunk(options)),
    stopChunk: (options) => use((t) => t.stopChunk(options)),
    stop: (options) => use((t) => t.stop(options)),
    startHar: (options) => use((t) => t.startHar(options).then(() => {})),
    stopHar: use((t) => t.stopHar()),
  })
}
