import { type Disposable } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Schema as S } from 'effect'
import net from 'node:net'
import { promisify } from 'node:util'
import { injectionTokens } from '../plugins/index.js'
import { LogLevel } from './log-level.js'
import { LoggingEvent } from './logging-event.js'
import { SerializedLoggingEventSchema } from './logging-event.schema.js'
import { type LoggingSink } from './logging-sink.js'

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
          const serialized: unknown = JSON.parse(
            dataSoFar.substring(0, index),
          )
          const logEvent = S.decodeUnknownSync(
            SerializedLoggingEventSchema,
          )(serialized)
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

  public listen(): Promise<LoggingServerAddress> {
    const { promise, resolve } = Promise.withResolvers<LoggingServerAddress>()
    this.#server.listen(() => {
      const address = this.#server.address()
      if (address === null || typeof address === 'string') {
        throw new Error(
          `Address of the logging server is not an AddressInfo: ${typeof address}`,
        )
      }
      resolve({ port: address.port })
    })
    return promise
  }

  public async dispose() {
    await promisify(this.#server.close.bind(this.#server))()
  }
}
