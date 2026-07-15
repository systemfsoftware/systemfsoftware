import { LogLevel } from './log-level.js'
import { LoggingEvent } from './logging-event.js'

export interface LoggingSink {
  log(event: LoggingEvent): void
  isEnabled(level: LogLevel): boolean
}
