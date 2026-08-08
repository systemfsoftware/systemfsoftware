import { FileDescriptions, StrykerOptions } from '@stryker-mutator/api/core'
import { LoggerFactoryMethod } from '@stryker-mutator/api/logging'
import { commonTokens, tokens } from '@stryker-mutator/api/plugin'
import { TestRunner } from '@stryker-mutator/api/test-runner'

import { LoggingServerAddress } from '../logging/index.js'
import { injectionTokens } from '../plugins/index.js'
import { Sandbox } from '../sandbox/sandbox.js'

import { IdGenerator } from '../worker-pool/id-generator.js'

import { ChildProcessTestRunnerProxy } from './child-process-test-runner-proxy.js'
import { CommandTestRunner } from './command-test-runner.js'
import { MaxTestRunnerReuseDecorator } from './max-test-runner-reuse-decorator.js'
import { ReloadEnvironmentDecorator } from './reload-environment-decorator.js'
import { RetryRejectedDecorator } from './retry-rejected-decorator.js'
import { TimeoutDecorator } from './timeout-decorator.js'

createTestRunnerFactory.inject = tokens(
  commonTokens.options,
  commonTokens.fileDescriptions,
  injectionTokens.sandbox,
  injectionTokens.loggingServerAddress,
  commonTokens.getLogger,
  injectionTokens.pluginModulePaths,
  injectionTokens.workerIdGenerator,
)
export function createTestRunnerFactory(
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  sandbox: Pick<Sandbox, 'workingDirectory'>,
  loggingServerAddress: LoggingServerAddress,
  getLogger: LoggerFactoryMethod,
  pluginModulePaths: readonly string[],
  idGenerator: IdGenerator,
): () => TestRunner {
  if (CommandTestRunner.is(options.testRunner)) {
    return () =>
      new RetryRejectedDecorator(
        getLogger(RetryRejectedDecorator.name),
        () =>
          new TimeoutDecorator(
            getLogger(TimeoutDecorator.name),
            () => new CommandTestRunner(sandbox.workingDirectory, options),
          ),
      )
  } else {
    return () =>
      new RetryRejectedDecorator(
        getLogger(RetryRejectedDecorator.name),
        () =>
          new ReloadEnvironmentDecorator(
            () =>
              new MaxTestRunnerReuseDecorator(
                () =>
                  new TimeoutDecorator(
                    getLogger(TimeoutDecorator.name),
                    () =>
                      new ChildProcessTestRunnerProxy(
                        options,
                        fileDescriptions,
                        sandbox.workingDirectory,
                        loggingServerAddress,
                        pluginModulePaths,
                        getLogger,
                        idGenerator,
                      ),
                  ),
                options,
              ),
          ),
      )
  }
}
