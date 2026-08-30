/**
 * Typed errors produced when Playwright operations fail.
 *
 * @since 0.1.0
 */

import { errors } from 'playwright-core'
import { PlaywrightError } from './errors.schema.js'

/**
 * Playwright does not provide detailed error information but there is
 * a distinction between timeout and other errors.
 *
 * @since 0.1.0
 * @internal
 */
export type PlaywrightErrorReason = 'Timeout' | 'Unknown'

/**
 * Error type that is returned when a Playwright error occurs.
 * Reason can either be "Timeout" or "Unknown".
 *
 * Timeout errors occur when a timeout is reached. All other errors are
 * grouped under "Unknown".
 *
 * @since 0.1.0
 * @internal
 */

/** @internal */
export function wrapError(error: unknown): PlaywrightError {
  if (error instanceof errors.TimeoutError) {
    return new PlaywrightError({
      cause: error,
      reason: 'Timeout',
    })
  } else {
    return new PlaywrightError({
      cause: error,
      reason: 'Unknown',
    })
  }
}

/** @internal */
export { PlaywrightError }
