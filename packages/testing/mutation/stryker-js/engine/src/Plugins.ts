import { Schema as S } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import type { AnyPluginContribution, ContributionOf, PluginContribution } from '@systemfsoftware/stryker-js/Plugin'

import { Module } from '@systemfsoftware/stryker-js/Module'
import { defaultOptions, importModule } from './Config.js'
import { StrykerError } from './stryker-error.schema.js'

import {
  PluginLoadFailedError,
  PluginModuleSchema,
  PluginNotFoundError,
  SchemaValidationContributionSchema,
} from './Plugins.schema.js'
import {
  LoadPluginsCommand,
  loadPluginsWorkflow,
  type PluginLoadDecision,
  type PluginLoadDecisionError,
  PluginLoaderEntry,
} from './Plugins.workflow.js'

interface ErrnoException extends Error {
  code?: string
}

function isErrnoException(error: unknown): error is ErrnoException {
  if (!(error instanceof Error) || !('code' in error)) {
    return false
  }
  const code: unknown = error.code
  return typeof code === 'string'
}

const IGNORED_PACKAGES = [
  '.bin',
  '.cache',
  '.pnp',
  'stryker',
  'stryker-api',
  'stryker-parent',
]

interface PluginModule {
  strykerPlugins: readonly PluginContribution<PluginKind>[]
}

interface SchemaValidationContribution {
  strykerValidationSchema: Record<string, unknown>
}

export interface LoadedPlugins {
  readonly schemaContributions: readonly Record<string, unknown>[]
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly PluginContribution<PluginKind>[]>
  readonly pluginModulePaths: readonly string[]
}

export function isAbsentPluginError(error: unknown, descriptor: string): boolean {
  if (
    isErrnoException(error) &&
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    typeof error.message === 'string' &&
    error.message.includes(descriptor)
  ) {
    return true
  }
  if (Predicate.hasProperty(error, 'code') && Predicate.hasProperty(error, 'message')) {
    const code = Reflect.get(error, 'code')
    const message = Reflect.get(error, 'message')
    if (code === 'ERR_MODULE_NOT_FOUND' && typeof message === 'string' && message.includes(descriptor)) {
      return true
    }
  }
  return false
}

function isEnoentError(error: unknown): boolean {
  return isErrnoException(error) && error.code === 'ENOENT'
}

function resolvePluginModules(
  pluginDescriptors: readonly string[],
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const results: string[][] = yield* Effect.forEach(
      pluginDescriptors,
      (pluginExpression: string) =>
        Effect.gen(function*() {
          if (pluginExpression.includes('*')) {
            return yield* globPluginModules(pluginExpression)
          }
          if (pathService.isAbsolute(pluginExpression) || pluginExpression.startsWith('.')) {
            const url = yield* pathService.toFileUrl(pathService.resolve(pluginExpression)).pipe(
              Effect.mapError((cause) => new PluginLoadFailedError({ descriptor: pluginExpression, cause })),
            )
            return [url.href]
          }
          return [pluginExpression]
        }),
      { concurrency: 'unbounded' },
    )
    return results.filter(Predicate.isNotNullish).flat()
  })
}

function globPluginModules(
  pluginExpression: string,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const { org, pkg } = parsePluginExpression(pluginExpression)
    const regexp = new RegExp(`^${pkg.replace('*', '.*')}`)
    const pluginNames = yield* readOrgDirectory(org)
    const plugins = pluginNames
      .filter((pluginName: string) => !IGNORED_PACKAGES.includes(pluginName) && regexp.test(pluginName))
      .map((pluginName: string) => {
        if (org.length > 0) {
          return `${org}/${pluginName}`
        }
        return pluginName
      })
    const defaults = yield* defaultOptions
    if (plugins.length === 0 && !defaults.plugins.includes(pluginExpression)) {
      yield* Effect.logWarning(`Expression "${pluginExpression}" not resulted in plugins to load.`)
    }
    for (const plugin of plugins) {
      yield* Effect.logDebug(`Loading plugin "${plugin}" (matched with expression ${pluginExpression})`)
    }
    return plugins
  })
}

function readOrgDirectory(
  org: string,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    let names: HashSet.HashSet<string> = HashSet.empty()
    const base = yield* path.fromFileUrl(new URL('.', import.meta.url)).pipe(Effect.orDie)
    let directory = path.dirname(base)
    for (;;) {
      let installRoot = path.join(directory, 'node_modules')
      if (path.basename(directory) === 'node_modules') {
        installRoot = directory
      }
      const orgDirectory = path.resolve(installRoot, org)
      const entriesEffect = fs.readDirectory(orgDirectory).pipe(
        Effect.tap((entries: ReadonlyArray<string>) =>
          Effect.gen(function*() {
            if (entries.length > 0) {
              yield* Effect.logDebug(`Found ${entries.length} ${org} packages in ${orgDirectory}`)
              for (const entry of entries) {
                names = HashSet.add(names, entry)
              }
            }
          })
        ),
        Effect.catchTag('PlatformError', (error) =>
          Match.value(error.reason).pipe(
            Match.tag('NotFound', () => {
              const empty: string[] = []
              return Effect.succeed(empty)
            }),
            Match.orElse(() => Effect.fail(new PluginLoadFailedError({ descriptor: orgDirectory, cause: error }))),
          )),
        Effect.catch((error: unknown) => {
          if (isEnoentError(error)) {
            const empty: string[] = []
            return Effect.succeed(empty)
          }
          return Effect.fail(new PluginLoadFailedError({ descriptor: orgDirectory, cause: error }))
        }),
      )
      yield* entriesEffect
      const parent = path.dirname(directory)
      if (parent === directory) {
        return Array.from(names)
      }
      directory = parent
    }
  })
}

function loadPlugin(
  descriptor: string,
  basePath: string,
): Effect.Effect<
  | {
    plugins: readonly PluginContribution<PluginKind>[] | undefined
    schemaContribution: Record<string, unknown> | undefined
  }
  | undefined,
  PluginLoadFailedError,
  Module | Path.Path
> {
  return Effect.gen(function*() {
    yield* Effect.logDebug(`Loading plugin ${descriptor}`)
    const moduleEffect = importModule(descriptor, basePath).pipe(
      Effect.catch((error) => {
        let cause: unknown = error
        if (error instanceof StrykerError) {
          cause = error.cause
        }
        if (isAbsentPluginError(cause, descriptor)) {
          return Effect.logWarning(`Cannot find plugin "${descriptor}".\n  Did you forget to install it ?`).pipe(
            Effect.asVoid,
          )
        }
        return Effect.logWarning(`Error during loading "${descriptor}" plugin`).pipe(
          Effect.andThen(() => Effect.fail(new PluginLoadFailedError({ descriptor, cause: error }))),
        )
      }),
    )
    const maybeModule = yield* moduleEffect
    if (maybeModule === undefined) {
      return undefined
    }
    const module = maybeModule
    let plugins: readonly PluginContribution<PluginKind>[] | undefined
    if (isPluginModule(module)) {
      plugins = module.strykerPlugins
    }
    let schemaContribution: Record<string, unknown> | undefined
    if (hasValidationSchemaContribution(module)) {
      schemaContribution = module.strykerValidationSchema
    }
    if (plugins !== undefined || schemaContribution !== undefined) {
      return {
        plugins,
        schemaContribution,
      }
    }
    yield* Effect.logWarning(
      `Module "${descriptor}" did not contribute a StrykerJS plugin. It didn't export a "strykerPlugins" or "strykerValidationSchema".`,
    )
    return undefined
  })
}

interface PluginLoaderRawEntry {
  readonly moduleName: string
  readonly plugins: readonly PluginContribution<PluginKind>[] | undefined
  readonly schemaContribution: Record<string, unknown> | undefined
}
interface PluginLoaderPhases extends Cell.Phases {
  readonly command: readonly string[]
  readonly raw: readonly PluginLoaderRawEntry[]
  readonly decoded: LoadPluginsCommand
  readonly decision: PluginLoadDecision
  readonly decisionError: PluginLoadDecisionError
  readonly output: PluginLoadDecision
  readonly response: LoadedPlugins
  readonly decodeError: never
  readonly readError: PluginLoadFailedError
  readonly writeError: never
}

const pluginLoaderDescription = (
  basePath: string,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  module: Context.Service.Shape<typeof Module>,
): Cell.WriteDone<PluginLoaderPhases> =>
  pipe(
    Cell.read<PluginLoaderPhases>((pluginDescriptors) =>
      Effect.gen(function*() {
        const pluginModules = yield* resolvePluginModules(pluginDescriptors)
        const loaded = yield* Effect.forEach(
          pluginModules,
          (moduleName: string) =>
            loadPlugin(moduleName, basePath).pipe(
              Effect.map((plugin) => {
                if (plugin === undefined) {
                  return undefined
                }
                return {
                  ...plugin,
                  moduleName,
                }
              }),
            ),
          { concurrency: 'unbounded' },
        ).pipe(Effect.map((arr) => arr.filter(Predicate.isNotNullish)))
        const raw: readonly PluginLoaderRawEntry[] = loaded.map((entry) => ({
          moduleName: entry.moduleName,
          plugins: entry.plugins,
          schemaContribution: entry.schemaContribution,
        }))
        return raw
      }).pipe(Effect.provide(Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, path),
        Layer.succeed(Module, module),
      )))
    ),
    Cell.decode<PluginLoaderPhases>((raw) => {
      const entries = raw.map((entry) =>
        PluginLoaderEntry.make({
          moduleName: entry.moduleName,
          plugins: entry.plugins,
          schemaContribution: entry.schemaContribution,
        })
      )
      return Result.succeed(LoadPluginsCommand.make({ entries }))
    }),
    Cell.decide<PluginLoaderPhases>(loadPluginsWorkflow),
    Cell.encode<PluginLoaderPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: (error) => {
          throw error
        },
        onSuccess: (decision) => decision,
      })
    ),
    Cell.write<PluginLoaderPhases>((output) =>
      Effect.gen(function*() {
        for (const shadowing of output.shadowings) {
          yield* Effect.logWarning(
            `Plugin "${shadowing.name}" of kind "${shadowing.kind}" at index ${shadowing.winnerIndex} shadows plugin at index ${shadowing.shadowedIndex}.`,
          )
        }
        const loaded: LoadedPlugins = {
          schemaContributions: output.schemaContributions,
          pluginsByKind: output.pluginsByKind,
          pluginModulePaths: output.pluginModulePaths,
        }
        return loaded
      })
    ),
  )

export function loadPlugins(
  pluginDescriptors: readonly string[],
  basePath: string,
): Effect.Effect<LoadedPlugins, PluginLoadFailedError, FileSystem.FileSystem | Module | Path.Path> {
  return Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const module = yield* Module
    return yield* Cell.apply(pluginLoaderDescription(basePath, fileSystem, path, module), pluginDescriptors)
  })
}

function parsePluginExpression(pluginExpression: string): { org: string; pkg: string } {
  const parts = pluginExpression.split('/')
  const first = parts[0]
  if (parts.length > 1 && first !== undefined && first.startsWith('@')) {
    return {
      org: parts.slice(0, 2).join('/').split('*')[0] ?? '',
      pkg: parts.slice(2).join('/'),
    }
  }
  return {
    org: '',
    pkg: pluginExpression,
  }
}

function isPluginModule(module: unknown): module is PluginModule {
  return S.is(PluginModuleSchema)(module)
}

function hasValidationSchemaContribution(module: unknown): module is SchemaValidationContribution {
  return S.is(SchemaValidationContributionSchema)(module)
}

// ---------------------------------------------------------------------------
// Creator — typed accessors over the loaded graph
// ---------------------------------------------------------------------------

function findPlugin<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
  const contributionsOption = HashMap.get(pluginsByKind, kind)
  if (Option.isNone(contributionsOption)) {
    return Effect.fail(
      new PluginNotFoundError({ descriptor: `${kind}:${name} (no ${kind} plugins were loaded)` }),
    )
  }
  const contributions = contributionsOption.value
  const found = contributions.find(
    (c): c is ContributionOf<K> => c.kind === kind && c.name.toLowerCase() === name.toLowerCase(),
  )
  if (found === undefined) {
    return Effect.fail(
      new PluginNotFoundError({
        descriptor: `${kind}:${name} (available: ${contributions.map((c) => c.name).join(', ')})`,
      }),
    )
  }
  return Effect.succeed(found)
}

export function create<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
  return findPlugin(pluginsByKind, kind, name)
}

export function createAll<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
): Effect.Effect<readonly ContributionOf<K>[]> {
  const contributions = HashMap.get(pluginsByKind, kind)
  if (Option.isNone(contributions)) {
    return Effect.succeed([])
  }
  return Effect.succeed(contributions.value.filter((c): c is ContributionOf<K> => c.kind === kind))
}
