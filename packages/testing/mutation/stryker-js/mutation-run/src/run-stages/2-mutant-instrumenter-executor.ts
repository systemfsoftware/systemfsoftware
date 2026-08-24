import { instrument } from '@systemfsoftware/stryker-js-instrumenter'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Scope from 'effect/Scope'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import { toInstrumenterFile } from '../project/project-file.js'
import { withInstrumentedFiles } from '../project/project.js'
import { RunEnvironment } from '../RunEnvironment.js'
import { makeSandbox } from '../sandbox/sandbox.js'
import { makeConcurrency } from '../worker-pool/concurrency-token-provider.js'
import type { InstrumentDone, InstrumentStage } from './stage-results.js'
import { InstrumentFailedError } from './stage.schema.js'

export class InstrumentLogger extends Context.Service<InstrumentLogger, Logger>()('InstrumentLogger') {}

export const instrumentStage: InstrumentStage<
  InstrumentFailedError,
  | InstrumentLogger
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | ChildProcessSpawner.ChildProcessSpawner
  | RunEnvironment
> = (prev) =>
  Effect.gen(function*() {
    const logger = yield* InstrumentLogger
    const env = yield* RunEnvironment

    const filesToMutate = yield* Effect.forEach([...prev.project.filesToMutate.values()], (file) =>
      toInstrumenterFile(file), {
      concurrency: 'unbounded',
    }).pipe(Effect.mapError((cause) =>
      new InstrumentFailedError({ reason: 'Failed to read files to mutate', cause })
    ))

    const instrumentResult = yield* instrument(filesToMutate, {
      ignorers: [...prev.ignorers],
      ...prev.options.mutator,
      plugins: prev.options.mutator.plugins === null ? null : [...prev.options.mutator.plugins],
      excludedMutations: [...prev.options.mutator.excludedMutations],
    }).pipe(Effect.mapError((cause) => new InstrumentFailedError({ reason: 'Instrumenter failed', cause })))

    const instrumentedProject = withInstrumentedFiles(prev.project, instrumentResult.files)

    const basePath = env.basePath
    const workingDirectory = prev.options.inPlace ? basePath : prev.temporaryDirectoryPath
    const backupDirectory = prev.options.inPlace ? prev.temporaryDirectoryPath : ''
    const sandbox = yield* makeSandbox({
      options: prev.options,
      logger,
      project: instrumentedProject,
      workingDirectory,
      backupDirectory,
      basePath,
    }).pipe(Effect.mapError((cause) => new InstrumentFailedError({ reason: 'Sandbox initialization failed', cause })))

    const concurrency = yield* makeConcurrency(prev.options, logger)

    return {
      ...prev,
      project: instrumentedProject,
      mutants: instrumentResult.mutants,
      sandbox,
      concurrency: {
        testRunners: concurrency.testRunners,
        checkers: concurrency.checkers,
      },
    } satisfies InstrumentDone
  })
