import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'

import { IdGenerator } from '../worker-pool/id-generator.js'

import type { LoggingServerAddress } from '../logging/index.js'
import { makeCheckerChildProcess } from './checker-child-process-proxy.js'
import type { CheckerResourceService } from './checker-resource.js'

export const createCheckerFactory = (
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  loggingServerAddress: LoggingServerAddress,
  pluginModulePaths: readonly string[],
  getLogger: LoggerFactoryMethod,
  idGenerator: IdGenerator,
): Effect.Effect<CheckerResourceService, unknown, Scope.Scope> =>
  makeCheckerChildProcess({
    options,
    fileDescriptions,
    pluginModulePaths,
    loggingServerAddress,
    workingDirectory: process.cwd(),
    logger: getLogger('CheckerChildProcess'),
    execArgv: [...(options.checkerNodeArgs ?? [])],
    idGenerator,
  })
