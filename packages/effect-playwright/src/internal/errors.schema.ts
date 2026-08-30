import { Schema } from 'effect'

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
export class PlaywrightError extends Schema.TaggedError<PlaywrightError>()(
  'PlaywrightError',
  {
    cause: Schema.Unknown,
    reason: Schema.Literals(['Timeout', 'Unknown']),
  },
) {}
