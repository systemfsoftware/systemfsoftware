import { Disposable } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import net from 'node:net'
import { promisify } from 'node:util'
import { injectionTokens } from '../plugins/index.js'
import { LogLevel } from './log-level.js'
import { LoggingEvent, SerializedLoggingEvent } from './logging-event.js'
import { LoggingSink } from './logging-sink.js'

export interface LoggingServerAddress {
  port: number
}

export const DELIMITER = '__STRYKER_CORE__'

export class LoggingServer implements Disposable {
  static readonly inject = [injectionTokens.loggingSink] as const
  #server

  constructor(private readonly loggingSink: LoggingSink) {
    this.#server = net.createServer((socket) => {
      socket.setEncoding('utf-8')
      let dataSoFar = ''
      socket.on('data', (data: string) => {
        dataSoFar += data
        let index
        while ((index = dataSoFar.indexOf(DELIMITER)) !== -1) {
          const logEvent: SerializedLoggingEvent = JSON.parse(
            dataSoFar.substring(0, index),
          )
          dataSoFar = dataSoFar.substring(index + DELIMITER.length)
          this.loggingSink.log(LoggingEvent.deserialize(logEvent))
        }
      })
      socket.on('error', (error) => {
        this.loggingSink.log(
          LoggingEvent.create(LoggingServer.name, LogLevel.Debug, [
            'An worker log process hung up unexpectedly',
            error,
          ]),
        )
      })
    })
  }

  public listen() {
    return new Promise<LoggingServerAddress>((res) => {
      this.#server.listen(() => {
        res({ port: (this.#server.address() as net.AddressInfo).port })
      })
    })
  }

  public async dispose() {
    await promisify(this.#server.close).bind(this.#server)()
  }
}
