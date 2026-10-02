import { Context } from 'effect'
import type * as Effect from 'effect/Effect'

import type { LogLevel } from './collector/message-router.schema.js'

/**
 * The capability a run announces and reports through. The console driver writes synchronously
 * to a `Writable`, so `write` has no error channel: naming one no driver can raise would force
 * every caller to handle a failure that cannot happen.
 */
export interface MessageWriter {
  readonly write: (level: LogLevel, text: string) => Effect.Effect<void>
}

export const MessageWriter = Context.Service<MessageWriter>('@systemfsoftware/api-extractor/MessageWriter')
