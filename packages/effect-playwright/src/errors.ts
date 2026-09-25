import { errors } from 'playwright-core'
import { PlaywrightError } from './errors.schema.js'

/**
 * Converts a thrown Playwright failure into a typed {@link PlaywrightError}.
 *
 * A playwright-core `TimeoutError` yields `reason` `"Timeout"`; every other
 * failure yields `"Unknown"`. The original error is preserved as `cause`.
 */
export const wrapError = <E>(error: E): PlaywrightError =>
  error instanceof errors.TimeoutError
    ? new PlaywrightError({ reason: 'Timeout', cause: error })
    : new PlaywrightError({ reason: 'Unknown', cause: error })
