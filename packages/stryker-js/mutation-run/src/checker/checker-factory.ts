import { FileDescriptions, StrykerOptions } from '@stryker-mutator/api/core'
import { LoggerFactoryMethod } from '@stryker-mutator/api/logging'
import { commonTokens, tokens } from '@stryker-mutator/api/plugin'

import { IdGenerator } from '../worker-pool/id-generator.js'

import { injectionTokens } from '../plugins/index.js'

import { LoggingServerAddress } from '../logging/index.js'
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
