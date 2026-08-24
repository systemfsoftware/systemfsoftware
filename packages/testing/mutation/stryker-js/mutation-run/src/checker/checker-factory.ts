import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'

import type { IdGeneratorShape } from '../worker-pool/id-generator.js'

import { makeCheckerChildProcess } from './checker-child-process-proxy.js'
import type { CheckerResourceService } from './checker-resource.js'

export const createCheckerFactory = (
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  pluginModulePaths: readonly string[],
  getLogger: LoggerFactoryMethod,
  idGenerator: IdGeneratorShape,
  workingDirectory: string,
): Effect.Effect<CheckerResourceService, unknown, Scope.Scope> =>
  makeCheckerChildProcess({
    options,
    fileDescriptions,
    pluginModulePaths,
    workingDirectory,
    logger: getLogger('CheckerChildProcess'),
    execArgv: [...(options.checkerNodeArgs ?? [])],
    idGenerator,
  })
