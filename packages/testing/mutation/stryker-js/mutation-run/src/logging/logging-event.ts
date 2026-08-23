import util from 'node:util'

import type { StrykerLogLevel } from './log-level.js'
import type { SerializedLoggingEvent } from './logging-event.schema.js'

export type { SerializedLoggingEvent } from './logging-event.schema.js'

/**
 * A single log event that crossed (or will cross) the framed TCP channel.
 * Formatting is deliberately minimal: workers serialize with `formatMessage`
 * (via `util.format`), the parent re-emits the already-formatted string
 * through Effect's `Logger` (`formatSimple` / `formatJson`) so colours and
 * destination are the Logger's concern, not the event's.
 */
export class LoggingEvent {
  readonly startTime: Date
  readonly categoryName: string
  readonly data: readonly unknown[]
  readonly level: StrykerLogLevel
  readonly pid: number

  private constructor(
    categoryName: string,
    level: StrykerLogLevel,
    data: readonly unknown[],
    startTime: Date,
    pid: number,
  ) {
    this.startTime = startTime
    this.categoryName = categoryName
    this.data = data
    this.level = level
    this.pid = pid
  }

  static create(
    categoryName: string,
    level: StrykerLogLevel,
    data: readonly unknown[],
  ): LoggingEvent {
    return new LoggingEvent(categoryName, level, data, new Date(), process.pid)
  }

  format(): string {
    return `${this.formatPrefix()} ${this.formatMessage()}`
  }

  private formatPrefix(): string {
    return `${this.startTime.toTimeString().slice(0, 8)} (${this.pid}) ${this.level.toUpperCase()} ${this.categoryName}`
  }

  private formatMessage(): string {
    return util.format(...this.data)
  }

  static deserialize(ser: SerializedLoggingEvent): LoggingEvent {
    return new LoggingEvent(
      ser.categoryName,
      ser.level,
      [ser.message],
      new Date(ser.startTime),
      ser.pid,
    )
  }

  serialize(): SerializedLoggingEvent {
    return {
      startTime: this.startTime.toJSON(),
      categoryName: this.categoryName,
      message: this.formatMessage(),
      level: this.level,
      pid: this.pid,
    }
  }
}
