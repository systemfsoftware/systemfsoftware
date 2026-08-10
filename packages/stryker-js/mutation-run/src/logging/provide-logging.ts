import { Logger, LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, Scope } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Injector } from 'typed-inject'
import { injectionTokens } from '../plugins/index.js'
import { LogLevel } from './log-level.js'
import { LoggerImpl } from './logger-impl.js'
import { LoggingBackend } from './logging-backend.js'
import { LoggingClient } from './logging-client.js'
import { LoggingServer, LoggingServerAddress } from './logging-server.js'
import { LoggingSink } from './logging-sink.js'

function getLoggerFactory(loggingSink: LoggingSink) {
  return (categoryName?: string): Logger => new LoggerImpl(categoryName ?? 'UNKNOWN', loggingSink)
}
getLoggerFactory.inject = [injectionTokens.loggingSink] as const

function loggerFactory(
  getLogger: LoggerFactoryMethod,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  target: Function | undefined,
) {
  return getLogger(target?.name)
}
loggerFactory.inject = [commonTokens.getLogger, commonTokens.target] as const

export function provideLogging<
  T extends { [injectionTokens.loggingSink]: LoggingSink },
>(injector: Injector<T>) {
  return injector
    .provideFactory(commonTokens.getLogger, getLoggerFactory)
    .provideFactory(commonTokens.logger, loggerFactory, Scope.Transient)
    .provideClass('loggingServer', LoggingServer)
}
provideLogging.inject = [
  injectionTokens.loggingSink,
  commonTokens.injector,
] as const

export async function provideLoggingBackend(
  injector: Injector,
  loggerConsoleOut: NodeJS.WriteStream,
  showColors: boolean,
) {
  const out = injector
    .provideValue(injectionTokens.loggerConsoleOut, loggerConsoleOut)
    .provideValue(injectionTokens.loggerShowColors, showColors)
    .provideClass(injectionTokens.loggingSink, LoggingBackend)
    .provideClass(injectionTokens.loggingServer, LoggingServer)
  const loggingServer = out.resolve(injectionTokens.loggingServer)
  const loggingServerAddress = await loggingServer.listen()
  return out.provideValue(
    injectionTokens.loggingServerAddress,
    loggingServerAddress,
  )
}
provideLoggingBackend.inject = [commonTokens.injector] as const

export type LoggingProvider = ReturnType<typeof provideLogging>

export async function provideLoggingClient(
  injector: Injector,
  loggingServerAddress: LoggingServerAddress,
  activeLogLevel: LogLevel,
) {
  const out = injector
    .provideValue(injectionTokens.loggingServerAddress, loggingServerAddress)
    .provideValue(injectionTokens.loggerActiveLevel, activeLogLevel)
    .provideClass(injectionTokens.loggingSink, LoggingClient)
  await out.resolve(injectionTokens.loggingSink).openConnection()
  return out
}
