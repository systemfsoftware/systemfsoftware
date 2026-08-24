import util from 'node:util'

import type { StrykerLogLevel } from './log-level.js'
import type { SerializedLoggingEvent } from './logging-event.schema.js'

export type { SerializedLoggingEvent } from './logging-event.schema.js'

/**
 * A single log event that crossed, or will cross, the framed TCP channel.
 *
 * Formatting is deliberately minimal: workers serialize with `util.format` and
 * the parent re-emits the already-formatted string through Effect's `Logger`
 * (`formatSimple` / `formatJson`), so colour and destination are the Logger's
 * concern and not the event's.
 */
export interface LoggingEvent {
  readonly startTime: Date
  readonly categoryName: string
  readonly data: readonly unknown[]
  readonly level: StrykerLogLevel
  readonly pid: number
}

/** The message alone, with `util.format` applied to the event's arguments. */
export const formatLoggingEventMessage = (event: LoggingEvent): string => util.format(...event.data)

/** `HH:MM:SS (pid) LEVEL category` — the prefix the human-facing log line carries. */
export const formatLoggingEventPrefix = (event: LoggingEvent): string =>
  `${event.startTime.toTimeString().slice(0, 8)} (${event.pid}) ${event.level.toUpperCase()} ${event.categoryName}`

/** The whole human-facing line. Pure: every input is on the event. */
export const formatLoggingEvent = (event: LoggingEvent): string =>
  `${formatLoggingEventPrefix(event)} ${formatLoggingEventMessage(event)}`

/** The wire form, with the arguments already collapsed to one message string. */
export const serializeLoggingEvent = (event: LoggingEvent): SerializedLoggingEvent => ({
  startTime: event.startTime.toJSON(),
  categoryName: event.categoryName,
  message: formatLoggingEventMessage(event),
  level: event.level,
  pid: event.pid,
})

/** Rebuild an event from the wire. The timestamp and pid are the sender's. */
export const deserializeLoggingEvent = (ser: SerializedLoggingEvent): LoggingEvent => ({
  startTime: new Date(ser.startTime),
  categoryName: ser.categoryName,
  data: [ser.message],
  level: ser.level,
  pid: ser.pid,
})
