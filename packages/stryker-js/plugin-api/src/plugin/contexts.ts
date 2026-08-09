import { FileDescriptions, StrykerOptions } from '../core/index.js'
import { Logger, LoggerFactoryMethod } from '../logging/index.js'

import { commonTokens } from './tokens.js'

/**
 * The basic dependency injection context within Stryker
 */
export interface BaseContext {
  [commonTokens.getLogger]: LoggerFactoryMethod
  [commonTokens.logger]: Logger
}

/**
 * The dependency injection context for most of Stryker's plugins.
 * Can inject basic stuff as well as the Stryker options
 */
export interface PluginContext extends BaseContext {
  [commonTokens.options]: StrykerOptions
  [commonTokens.fileDescriptions]: FileDescriptions
}

/**
 * The dependency injection context for test-runner plugins that Stryker
 * instantiates inside the sandbox. `sandboxDirectory` is the absolute path of
 * the project copy under test. It is bound only in test-runner workers: the
 * test-runner proxy passes the sandbox's working directory, while checker
 * workers are spawned with the main process cwd and must not inject it.
 * Plugins that run in the main process, such as reporters, must not inject it
 * either.
 */
export interface SandboxPluginContext extends PluginContext {
  [commonTokens.sandboxDirectory]: string
}
