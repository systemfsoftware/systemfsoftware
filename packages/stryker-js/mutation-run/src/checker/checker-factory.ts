import { type FileDescriptions, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { IdGenerator } from '../worker-pool/id-generator.js'

import { injectionTokens } from '../plugins/index.js'

import { type LoggingServerAddress } from '../logging/index.js'
import { CheckerChildProcessProxy } from './checker-child-process-proxy.js'
import { CheckerFacade } from './checker-facade.js'
import { CheckerRetryDecorator } from './checker-retry-decorator.js'

createCheckerFactory.inject = tokens(
  commonTokens.options,
  commonTokens.fileDescriptions,
  injectionTokens.loggingServerAddress,
  injectionTokens.pluginModulePaths,
  commonTokens.getLogger,
  injectionTokens.workerIdGenerator,
)
export function createCheckerFactory(
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  loggingServerAddress: LoggingServerAddress,
  pluginModulePaths: readonly string[],
  getLogger: LoggerFactoryMethod,
  idGenerator: IdGenerator,
): () => CheckerFacade {
  return () =>
    new CheckerFacade(
      () =>
        new CheckerRetryDecorator(
          () =>
            new CheckerChildProcessProxy(
              options,
              fileDescriptions,
              pluginModulePaths,
              loggingServerAddress,
              getLogger,
              idGenerator,
            ),
          getLogger(CheckerRetryDecorator.name),
        ),
    )
}
