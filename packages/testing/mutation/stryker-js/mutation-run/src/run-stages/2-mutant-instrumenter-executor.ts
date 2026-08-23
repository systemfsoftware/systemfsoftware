import {
  createInstrumenter,
  type InstrumenterOptions,
  type InstrumentResult,
} from '@systemfsoftware/stryker-js-instrumenter'
import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import {
  commonTokens,
  type Injector,
  type PluginContext,
  PluginKind,
  tokens,
} from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { type Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import { type I } from '@systemfsoftware/stryker-js-util'
import type { execaCommand } from 'execa'

import { createCheckerFactory } from '../checker/index.js'
import type { ResolvedMode } from '../output-mode.js'
import { injectionTokens, PluginCreator } from '../plugins/index.js'
import { FileSystem, Project } from '../project/index.js'
import type { RunEventSink } from '../run-event.js'
import { createPreprocessor } from '../sandbox/index.js'
import { Sandbox } from '../sandbox/sandbox.js'
import { TemporaryDirectory } from '../sandbox/temporary-directory.js'
import { Timer } from '../timer.js'
import { UnexpectedExitHandler } from '../unexpected-exit-handler.js'
import { IdGenerator } from '../worker-pool/id-generator.js'
import { ConcurrencyTokenProvider, createCheckerPool } from '../worker-pool/index.js'

import { type DryRunContext } from './3-dry-run-executor.js'

export interface MutantInstrumenterContext extends PluginContext {
  [commonTokens.options]: StrykerOptions
  [injectionTokens.project]: Project
  [injectionTokens.reporter]: Required<Reporter>
  [injectionTokens.timer]: I<Timer>
  [injectionTokens.temporaryDirectory]: I<TemporaryDirectory>
  [injectionTokens.execa]: typeof execaCommand
  [injectionTokens.process]: NodeJS.Process
  [injectionTokens.unexpectedExitRegistry]: I<UnexpectedExitHandler>
  [injectionTokens.pluginModulePaths]: readonly string[]
  [injectionTokens.fs]: I<FileSystem>
  [injectionTokens.pluginCreator]: PluginCreator
  [injectionTokens.loggingServerAddress]: { port: number }
  [injectionTokens.runEventSink]: RunEventSink
  [injectionTokens.runId]: string
  [injectionTokens.resolvedMode]: ResolvedMode
}

export class MutantInstrumenterExecutor {
  public static readonly inject = tokens(
    commonTokens.injector,
    injectionTokens.project,
    commonTokens.options,
    injectionTokens.pluginCreator,
  )
  constructor(
    private readonly injector: Injector<MutantInstrumenterContext>,
    private readonly project: Project,
    private readonly options: StrykerOptions,
    private readonly pluginCreator: PluginCreator,
  ) {}

  public async execute(): Promise<Injector<DryRunContext>> {
    // Create the checker and instrumenter
    const instrumenter = this.injector.injectFunction(createInstrumenter)

    // Instrument files in-memory
    const ignorers = this.options.ignorers.map((name) => this.pluginCreator.create(PluginKind.Ignore, name))
    // `mutator` decodes to readonly arrays; the instrumenter takes mutable
    // ones, so the plugin descriptors are copied into fresh arrays here.
    const instrumenterOptions: InstrumenterOptions = {
      ignorers,
      ...this.options.mutator,
      plugins: this.options.mutator.plugins === null
        ? null
        : [...this.options.mutator.plugins],
      excludedMutations: [...this.options.mutator.excludedMutations],
    }
    const instrumentResult = await instrumenter.instrument(
      await this.readFilesToMutate(),
      instrumenterOptions,
    )

    // Preprocess the project
    const preprocess = this.injector.injectFunction(createPreprocessor)
    this.writeInstrumentedFiles(instrumentResult)
    await preprocess.preprocess(this.project)

    // Initialize the checker pool
    const concurrencyTokenProviderProvider = this.injector.provideClass(
      injectionTokens.concurrencyTokenProvider,
      ConcurrencyTokenProvider,
    )
    const concurrencyTokenProvider = concurrencyTokenProviderProvider.resolve(
      injectionTokens.concurrencyTokenProvider,
    )

    const checkerPoolProvider = concurrencyTokenProviderProvider
      .provideValue(
        injectionTokens.checkerConcurrencyTokens,
        concurrencyTokenProvider.checkerToken$,
      )
      .provideClass(injectionTokens.workerIdGenerator, IdGenerator)
      .provideFactory(injectionTokens.checkerFactory, createCheckerFactory)
      .provideFactory(injectionTokens.checkerPool, createCheckerPool)
    const checkerPool = checkerPoolProvider.resolve(injectionTokens.checkerPool)
    await checkerPool.init()

    // Feed the sandbox
    const dryRunProvider = checkerPoolProvider
      .provideClass(injectionTokens.sandbox, Sandbox)
      .provideValue(injectionTokens.mutants, instrumentResult.mutants)
    const sandbox = dryRunProvider.resolve(injectionTokens.sandbox)
    await sandbox.init()
    return dryRunProvider
  }

  private readFilesToMutate() {
    return Promise.all(
      [...this.project.filesToMutate.values()].map((file) => file.toInstrumenterFile()),
    )
  }

  private writeInstrumentedFiles(instrumentResult: InstrumentResult): void {
    for (const { name, content } of Object.values(instrumentResult.files)) {
      const file = this.project.files.get(name)
      if (file === undefined) {
        throw new Error(
          `Instrumented file "${name}" is missing from the project's file map.`,
        )
      }
      file.setContent(content)
    }
  }
}
