import { frameworkPluginsFileUrl } from '@stryker-mutator/instrumenter'
import { deepFreeze } from '@stryker-mutator/util'
import { type PartialStrykerOptions, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type BaseContext, commonTokens, type Injector, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as S from 'effect/Schema'
import { execaCommand } from 'execa'
import { forkCoreSchema } from '../config/fork-schema.js'

import { ConfigReader } from '../config/config-reader.js'
import { MetaSchemaBuilder, OptionsValidator } from '../config/index.js'
import { ConfigError } from '../errors.js'
import type { ResolvedMode } from '../output-mode.js'
import { injectionTokens, PluginCreator } from '../plugins/index.js'
import { PluginLoader } from '../plugins/plugin-loader.js'
import { BroadcastReporter } from '../reporting/broadcast-reporter.js'
import type { RunEventSink } from '../run-event.js'
import { TemporaryDirectory } from '../sandbox/temporary-directory.js'
import { Timer } from '../timer.js'
import { UnexpectedExitHandler } from '../unexpected-exit-handler.js'

import { FileSystem, ProjectReader } from '../project/index.js'

import { type Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import { LoggingBackend, type LoggingServerAddress } from '../logging/index.js'
import { type MutantInstrumenterContext } from './index.js'

export interface PrepareExecutorContext extends BaseContext {
  [injectionTokens.loggingServerAddress]: LoggingServerAddress
  /** Always provided; `undefined` is the absence of an override. */
  [injectionTokens.reporterOverride]?: Reporter | undefined
  [injectionTokens.reporterPluginModules]: string[]
  [injectionTokens.runEventSink]: RunEventSink
  [injectionTokens.runId]: string
  [injectionTokens.resolvedMode]: ResolvedMode
  [injectionTokens.progressEnabled]: boolean
  [injectionTokens.clearTextEnabled]: boolean
  [injectionTokens.runStartedAt]: number
}

export interface PrepareExecutorArgs {
  cliOptions: PartialStrykerOptions
  targetMutatePatterns: string[] | undefined
}

export class PrepareExecutor {
  public static readonly inject = tokens(
    commonTokens.injector,
    injectionTokens.loggingSink,
    injectionTokens.reporterPluginModules,
  )
  constructor(
    private readonly injector: Injector<PrepareExecutorContext>,
    private readonly loggingBackend: LoggingBackend,
    private readonly reporterPluginModules: readonly string[],
  ) {}

  public async execute({
    cliOptions,
    targetMutatePatterns,
  }: PrepareExecutorArgs): Promise<Injector<MutantInstrumenterContext>> {
    // greedy initialize, so the time starts immediately
    const timer = new Timer()

    // Already configure the logger, so next classes can use them
    this.loggingBackend.configure(cliOptions)

    // Read the config file
    const configReaderInjector = this.injector
      .provideValue(injectionTokens.validationSchema, forkCoreSchema)
      .provideClass(injectionTokens.optionsValidator, OptionsValidator)
    const configReader = configReaderInjector.injectClass(ConfigReader)
    const options: StrykerOptions = await configReader.readConfig(cliOptions)

    // Load plugins
    const pluginLoader = configReaderInjector.injectClass(PluginLoader)
    const pluginDescriptors = [
      ...options.plugins,
      frameworkPluginsFileUrl,
      ...this.reporterPluginModules,
      ...options.appendPlugins,
    ]
    const loadedPlugins = await pluginLoader.load(pluginDescriptors)

    // Revalidate the options with plugin schema additions
    const metaSchemaBuilder = configReaderInjector.injectClass(MetaSchemaBuilder)
    const metaSchema = metaSchemaBuilder.buildMetaSchema(
      loadedPlugins.schemaContributions,
    )
    const optionsValidatorInjector = configReaderInjector.provideValue(
      injectionTokens.validationSchema,
      // The merged schema is consumed as data by the validator: the same
      // opaque `Record<string, unknown>` contract `forkCoreSchema` provides,
      // not the ajv-typed view the builder returns.
      S.decodeUnknownSync(S.Record(S.String, S.Unknown))(metaSchema),
    )
    const validator: OptionsValidator = optionsValidatorInjector.injectClass(OptionsValidator)
    validator.validate(options, true)

    // Done reading config, deep freeze it so it won't change unexpectedly
    deepFreeze(options)

    // Final logging configuration, update the logging configuration with the latest results
    this.loggingBackend.configure(options)

    // Resolve input files
    const projectFileReaderInjector = optionsValidatorInjector
      .provideValue(commonTokens.options, options)
      .provideClass(injectionTokens.temporaryDirectory, TemporaryDirectory)
      .provideClass(injectionTokens.fs, FileSystem)
      .provideValue(injectionTokens.pluginsByKind, loadedPlugins.pluginsByKind)
    const project = await projectFileReaderInjector
      .injectClass(ProjectReader)
      .read(targetMutatePatterns)

    if (project.isEmpty) {
      throw new ConfigError('No input files found.')
    } else {
      // Done preparing, finish up and return
      await projectFileReaderInjector
        .resolve(injectionTokens.temporaryDirectory)
        .initialize()
      return projectFileReaderInjector
        .provideValue(injectionTokens.project, project)
        .provideValue(commonTokens.fileDescriptions, project.fileDescriptions)
        .provideClass(injectionTokens.pluginCreator, PluginCreator)
        .provideClass(injectionTokens.reporter, BroadcastReporter)
        .provideValue(injectionTokens.timer, timer)
        .provideValue(injectionTokens.project, project)
        .provideValue(injectionTokens.execa, execaCommand)
        .provideValue(injectionTokens.process, process)
        .provideClass(injectionTokens.unexpectedExitRegistry, UnexpectedExitHandler)
        .provideValue(
          injectionTokens.pluginModulePaths,
          loadedPlugins.pluginModulePaths,
        )
    }
  }
}
