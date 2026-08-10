import { URL } from 'url'

import { FileDescriptions, Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Disposable } from 'typed-inject'

import { ChildProcessProxy } from '../worker-pool/child-process-proxy.js'
import { IdGenerator } from '../worker-pool/id-generator.js'
import { Resource } from '../worker-pool/pool.js'

import { LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { LoggingServerAddress } from '../logging/index.js'
import { CheckerResource } from './checker-resource.js'
import { CheckerWorker } from './checker-worker.js'

export class CheckerChildProcessProxy implements CheckerResource, Disposable, Resource {
  private readonly childProcess: ChildProcessProxy<CheckerWorker>

  constructor(
    options: StrykerOptions,
    fileDescriptions: FileDescriptions,
    pluginModulePaths: readonly string[],
    loggingServerAddress: LoggingServerAddress,
    getLogger: LoggerFactoryMethod,
    idGenerator: IdGenerator,
  ) {
    this.childProcess = ChildProcessProxy.create(
      new URL('./checker-worker.mjs', import.meta.url).toString(),
      loggingServerAddress,
      options,
      fileDescriptions,
      pluginModulePaths,
      process.cwd(),
      CheckerWorker,
      options.checkerNodeArgs,
      getLogger,
      idGenerator,
    )
  }

  public async dispose(): Promise<void> {
    await this.childProcess.dispose()
  }

  public async init(): Promise<void> {
    await this.childProcess.proxy.init()
  }

  public async check(
    checkerName: string,
    mutants: Mutant[],
  ): ReturnType<CheckerResource['check']> {
    return this.childProcess.proxy.check(checkerName, mutants)
  }

  public async group(
    checkerName: string,
    mutants: Mutant[],
  ): ReturnType<CheckerResource['group']> {
    return this.childProcess.proxy.group(checkerName, mutants)
  }
}
