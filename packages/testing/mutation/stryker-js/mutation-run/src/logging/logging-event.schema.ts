import { Schema as S } from 'effect'

import { StrykerLogLevel } from './log-level.js'

/**
 * The wire format of a {@link LoggingEvent}; worker processes serialize
 * events over the logging socket, the server deserializes them.
 */
export const SerializedLoggingEventSchema = S.Struct({
  startTime: S.String,
  categoryName: S.String,
  message: S.String,
  level: S.Literals([
    StrykerLogLevel.Trace,
    StrykerLogLevel.Debug,
    StrykerLogLevel.Information,
    StrykerLogLevel.Warning,
    StrykerLogLevel.Error,
    StrykerLogLevel.Fatal,
    StrykerLogLevel.Off,
  ]),
  pid: S.Finite,
})

export type SerializedLoggingEvent = S.Schema.Type<
  typeof SerializedLoggingEventSchema
>
