import { Context } from 'effect'
import type * as Effect from 'effect/Effect'
import type { PlatformError } from 'effect/PlatformError'

import type { LogLevel } from './collector/message-router.schema.js'

export interface MessageWriter {
  readonly write: (level: LogLevel, text: string) => Effect.Effect<void, PlatformError>
}

export const MessageWriter = Context.Service<MessageWriter>('@systemfsoftware/api-extractor/MessageWriter')
