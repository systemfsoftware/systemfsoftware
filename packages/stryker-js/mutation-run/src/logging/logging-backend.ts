import { type PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import fs from 'fs'
import { type Disposable } from 'typed-inject'
import { promisify } from 'util'
import { injectionTokens } from '../plugins/index.js'
import { LogLevel } from './log-level.js'
import { LoggingEvent } from './logging-event.js'
import { type LoggingSink } from './logging-sink.js'
import { logLevelPriority, minPriority } from './priority.js'

const LOG_FILE_NAME = 'stryker.log'

/**
 * The logging backend that handles the actual logging. So to both a file and the stdout, stderr.
 */
export class LoggingBackend implements LoggingSink, Disposable {
  activeStdoutLevel: LogLevel = LogLevel.Information
  activeFileLevel: LogLevel = LogLevel.Off
  showColors: boolean
  #consoleOut

  static readonly inject = [injectionTokens.loggerConsoleOut, injectionTokens.loggerShowColors] as const

  constructor(consoleOut: NodeJS.WritableStream, showColors: boolean) {
    this.#consoleOut = consoleOut
    this.showColors = showColors
  }

  log(event: LoggingEvent) {
    const eventPriority = logLevelPriority[event.level]
    if (eventPriority >= logLevelPriority[this.activeStdoutLevel]) {
      this.#consoleOut.write(
        `${this.showColors ? event.formatColorized() : event.format()}\n`,
      )
    }
    if (
      eventPriority >= logLevelPriority[this.activeFileLevel] &&
      !this.#fileStream.errored
    ) {
      this.#fileStream.write(`${event.format()}\n`)
    }
  }

  isEnabled(level: LogLevel) {
    const priority = logLevelPriority[level]
    return priority >= this.priority
  }

  get activeLogLevel() {
    return minPriority(this.activeStdoutLevel, this.activeFileLevel)
  }

  get priority() {
    return logLevelPriority[this.activeLogLevel]
  }

  /**
   * `allowConsoleColors` is deliberately not read here (R8). It defaults to
   * `true` in the schema, so honouring it would re-enable colour on every run
   * and defeat the machine-mode contract; colour is decided once, from the
   * resolved mode and `NO_COLOR`, and injected at construction.
   */
  configure({ logLevel, fileLogLevel }: PartialStrykerOptions) {
    if (logLevel) {
      this.activeStdoutLevel = logLevel
    }
    if (fileLogLevel) {
      this.activeFileLevel = fileLogLevel
    }
  }

  #_fileStream?: fs.WriteStream
  get #fileStream() {
    if (!this.#_fileStream) {
      this.#_fileStream = fs.createWriteStream(LOG_FILE_NAME, { flags: 'a' })
      this.#_fileStream.on('error', (error) => {
        console.error(
          `An error occurred while writing to "${LOG_FILE_NAME}"`,
          error,
        )
      })
    }
    return this.#_fileStream
  }

  async dispose() {
    if (this.#_fileStream) {
      await promisify(this.#_fileStream.end.bind(this.#_fileStream))()
    }
  }
}
