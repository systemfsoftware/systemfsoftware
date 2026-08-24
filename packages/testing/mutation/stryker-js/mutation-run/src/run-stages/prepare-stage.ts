import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Ignorer, type IgnorerService } from '@systemfsoftware/stryker-js-plugin-api/ignore'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { composePlugins, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { AnyPluginContribution } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Scope from 'effect/Scope'
import { EngineLogLevel } from '../engine-logger.js'

import { readConfig } from '../config/config-reader.js'
import { forkCoreSchema } from '../config/fork-schema.js'
import type { ValidationSchemaDocument } from '../config/options-validator.js'
import { validateOptions } from '../config/options-validator.js'
import { createAll } from '../plugins/plugin-creator.js'
import { loadPlugins } from '../plugins/plugin-loader.js'
import { readProject } from '../project/project-reader.js'
import { RunEnvironment } from '../run-environment.js'
import { TemporaryDirectory, TemporaryDirectoryLive } from '../sandbox/temporary-directory.js'
import { makeTimer } from '../timer.js'

import { selectReporters } from '../reporting/reporter-selection.kernel.js'
import type { PrepareDone, PrepareStage } from './stage-results.js'
import { StageError } from './stage.schema.js'

export class PrepareLogger extends Context.Service<PrepareLogger, Logger>()('PrepareLogger') {}

export interface PrepareExecutorArgs {
  cliOptions: PartialStrykerOptions
  targetMutatePatterns: string[] | undefined
}

const buildMergedSchema = (
  core: ValidationSchemaDocument,
  contributions: readonly Record<string, unknown>[],
): ValidationSchemaDocument => {
  if (contributions.length === 0) {
    return core
  }
  const merged: Record<string, unknown> = { ...core }
  const corePropsValue = merged['properties']
  const corePropsRecord: Record<string, unknown> = {}
  if (typeof corePropsValue === 'object' && corePropsValue !== null) {
    for (const [k, v] of Object.entries(corePropsValue)) {
      corePropsRecord[k] = v
    }
  }
  for (const contrib of contributions) {
    const props = contrib['properties']
    if (typeof props === 'object' && props !== null) {
      for (const [k, v] of Object.entries(props)) {
        corePropsRecord[k] = v
      }
    }
    const defs = contrib['definitions']
    if (typeof defs === 'object' && defs !== null) {
      const existingDefs = merged['definitions']
      const defsRecord: Record<string, unknown> = {}
      if (typeof existingDefs === 'object' && existingDefs !== null) {
        for (const [k, v] of Object.entries(existingDefs)) {
          defsRecord[k] = v
        }
      }
      for (const [k, v] of Object.entries(defs)) {
        defsRecord[k] = v
      }
      merged['definitions'] = defsRecord
    }
  }
  merged['properties'] = corePropsRecord
  return merged
}

export const prepareStage: PrepareStage<
  StageError,
  PrepareLogger | RunEnvironment | FileSystem.FileSystem | Path.Path | Scope.Scope | EngineLogLevel
> = (args: PrepareExecutorArgs) =>
  Effect.gen(function*() {
    yield* Scope.Scope
    const log = yield* PrepareLogger
    const env = yield* RunEnvironment
    const timer = yield* makeTimer

    const coreSchema: ValidationSchemaDocument = forkCoreSchema

    const configured = yield* readConfig(args.cliOptions, log, coreSchema, env.basePath).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to read config', cause })),
    )
    // Narrowed once, here, before any plugin is composed: the reporter set the
    // rest of the run sees is already the one this output mode permits, so the
    // broadcast needs no second opinion about it.
    const options = {
      ...configured,
      reporters: selectReporters(configured.reporters, env.resolvedMode.mode),
    }
    yield* Effect.flatMap(EngineLogLevel, (level) => level.set(options.logLevel))

    const descriptors: readonly string[] = [...options.plugins, ...options.appendPlugins, ...env.reporterPluginModules]

    const loaded = yield* loadPlugins(descriptors, log, env.basePath).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to load plugins', cause })),
    )

    const mergedSchema = buildMergedSchema(coreSchema, loaded.schemaContributions)
    if (loaded.schemaContributions.length > 0) {
      const record: Record<string, unknown> = { ...options }
      yield* validateOptions(record, mergedSchema, log, true).pipe(
        Effect.mapError(
          (cause) =>
            new StageError({ stage: 'prepare', reason: 'Failed to revalidate options with plugin schema', cause }),
        ),
      )
    }

    const project = yield* readProject(options, log, args.targetMutatePatterns, env.basePath).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to read project', cause })),
    )

    if (project.files.size === 0) {
      return yield* new StageError({ stage: 'prepare', reason: 'No input files found.' })
    }

    const contributions = yield* createAll(loaded.pluginsByKind, PluginKind.Ignore).pipe(
      Effect.mapError((cause) => new StageError({ stage: 'prepare', reason: 'Failed to create ignorers', cause })),
    )

    const ignorers: readonly IgnorerService[] = yield* Effect.forEach(contributions, (contribution) =>
      Effect.gen(function*() {
        const ctx = yield* Layer.build(contribution.layer)
        return Context.get(ctx, Ignorer)
      }).pipe(
        Effect.provideService(RunConfiguration, options),
        Effect.provideService(SandboxDirectory, env.basePath),
      )).pipe(
        Effect.mapError((cause) =>
          new StageError({ stage: 'prepare', reason: 'Failed to build ignorers', cause })
        ),
      )

    const temporaryDirectoryPath = yield* Effect.gen(function*() {
      const live = TemporaryDirectoryLive(options, log)
      const service = yield* Effect.service(TemporaryDirectory).pipe(Effect.provide(live))
      return service.path
    }).pipe(
      Effect.mapError((cause) =>
        new StageError({ stage: 'prepare', reason: 'Failed to create temporary directory', cause })
      ),
    )

    const allContributions: readonly AnyPluginContribution[] = (() => {
      const out: Array<AnyPluginContribution> = []
      for (const arr of HashMap.values(loaded.pluginsByKind)) {
        for (const c of arr) {
          out.push(c)
        }
      }
      return out
    })()

    const plugins = composePlugins(allContributions)

    return {
      project,
      plugins,
      loadedPlugins: loaded,
      ignorers,
      options,
      timer,
      temporaryDirectoryPath,
    } satisfies PrepareDone
  })
