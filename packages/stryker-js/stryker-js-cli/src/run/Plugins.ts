import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'

import type { AnyPluginContribution, PluginContribution } from '@systemfsoftware/stryker-js/Plugin'
import { foldContributions } from '@systemfsoftware/stryker-js/Plugin'
import type { PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'

import { defaultOptions, importModule } from './Config.js'
import { Module } from './Module.js'
import { StrykerError } from './stryker-error.schema.js'

import {
  PluginLoadFailedError,
  PluginModuleSchema,
  PluginNotFoundError,
  SchemaValidationContributionSchema,
} from './Plugins.schema.js'

export interface PluginLoaderEntryLike {
  readonly moduleName: string
  readonly plugins: readonly PluginContribution<PluginKind>[] | undefined
  readonly schemaContribution: Record<string, unknown> | undefined
}

export interface PluginLoadPlan {
  readonly schemaContributions: readonly Record<string, unknown>[]
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly PluginContribution<PluginKind>[]>
  readonly shadowings: readonly {
    readonly kind: PluginKind
    readonly name: string
    readonly shadowedIndex: number
    readonly winnerIndex: number
  }[]
}

export const buildPluginLoadPlan = (entries: readonly PluginLoaderEntryLike[]): PluginLoadPlan => {
  const shadowingState = entries.reduce<{
    readonly seen: HashMap.HashMap<string, number>
    readonly shadowings: readonly {
      readonly kind: PluginKind
      readonly name: string
      readonly shadowedIndex: number
      readonly winnerIndex: number
    }[]
  }>(
    (acc, entry, index) =>
      Option.match(Option.fromUndefinedOr(entry.plugins), {
        onNone: () => acc,
        onSome: (plugins) =>
          plugins.reduce(
            (inner, plugin) => {
              const key = `${plugin.kind}:${plugin.name}`
              const previousOption = HashMap.get(inner.seen, key)
              const nextShadowings = Option.match(previousOption, {
                onNone: () => inner.shadowings,
                onSome: (prev) => [
                  ...inner.shadowings,
                  {
                    kind: plugin.kind,
                    name: plugin.name,
                    shadowedIndex: prev,
                    winnerIndex: index,
                  },
                ],
              })
              return {
                seen: HashMap.set(inner.seen, key, index),
                shadowings: nextShadowings,
              }
            },
            acc,
          ),
      }),
    { seen: HashMap.empty<string, number>(), shadowings: [] },
  )

  const pluginsByKind = entries.reduce<HashMap.HashMap<PluginKind, readonly PluginContribution<PluginKind>[]>>(
    (map, entry) =>
      Option.match(Option.fromUndefinedOr(entry.plugins), {
        onNone: () => map,
        onSome: (plugins) =>
          plugins.reduce(
            (inner, plugin) =>
              Option.match(HashMap.get(inner, plugin.kind), {
                onNone: () => HashMap.set(inner, plugin.kind, [plugin]),
                onSome: (existing) => HashMap.set(inner, plugin.kind, [...existing, plugin]),
              }),
            map,
          ),
      }),
    HashMap.empty<PluginKind, readonly PluginContribution<PluginKind>[]>(),
  )

  const schemaContributions = entries.flatMap((entry) =>
    Option.match(Option.fromUndefinedOr(entry.schemaContribution), {
      onNone: () => [],
      onSome: (value) => [value],
    })
  )

  return {
    schemaContributions,
    pluginsByKind,
    shadowings: shadowingState.shadowings,
  }
}

interface ErrnoException extends Error {
  code?: string
}

const isError = (error: unknown): error is Error => error instanceof Error

const hasErrorCode = (error: unknown): error is Record<'code', unknown> => Predicate.hasProperty(error, 'code')

const hasErrorMessage = (error: unknown): error is Record<'message', unknown> => Predicate.hasProperty(error, 'message')

const errorCodeOf = (error: unknown): unknown =>
  Match.value(error).pipe(
    Match.when(hasErrorCode, (carrier: Record<'code', unknown>) => carrier.code),
    Match.orElse(() => undefined),
  )

const errorMessageOf = (error: unknown): unknown =>
  Match.value(error).pipe(
    Match.when(hasErrorMessage, (carrier: Record<'message', unknown>) => carrier.message),
    Match.orElse(() => undefined),
  )

const isText = (value: unknown): value is string => typeof value === 'string'

const messageNamesDescriptor = (message: unknown, descriptor: string): boolean =>
  Match.value(message).pipe(
    Match.when(isText, (text: string) => text.includes(descriptor)),
    Match.orElse(() => false),
  )

function isErrnoException(error: unknown): error is ErrnoException {
  return Match.value(isError(error)).pipe(
    Match.when(true, () => typeof errorCodeOf(error) === 'string'),
    Match.orElse(() => false),
  )
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
}

export interface ComposedPlugins {
  readonly reporterFactories: readonly { readonly name: string; readonly factory: ReporterFactory }[]
}

const isReporterContribution = (contribution: AnyPluginContribution): contribution is PluginContribution<'Reporter'> =>
  contribution.kind === 'Reporter'

const reporterFactoryOf = (
  contribution: AnyPluginContribution,
): readonly { readonly name: string; readonly factory: ReporterFactory }[] =>
  Match.value(contribution).pipe(
    Match.when(isReporterContribution, (reporter) => [{ name: reporter.name, factory: reporter.make }]),
    Match.orElse((): readonly [] => []),
  )

export const composePlugins = (contributions: readonly AnyPluginContribution[]): ComposedPlugins => ({
  reporterFactories: foldContributions(contributions).contributions.flatMap(reporterFactoryOf),
})

export function isAbsentPluginError(error: unknown, descriptor: string): boolean {
  return Match.value(errorCodeOf(error) === 'ERR_MODULE_NOT_FOUND').pipe(
    Match.when(true, () => messageNamesDescriptor(errorMessageOf(error), descriptor)),
    Match.orElse(() => false),
  )
}

function isEnoentError(error: unknown): boolean {
  return Match.value(isErrnoException(error)).pipe(
    Match.when(true, () => errorCodeOf(error) === 'ENOENT'),
    Match.orElse(() => false),
  )
}

type PluginExpressionClass = 'Glob' | 'FilePath' | 'Module'

const isPluginGlobExpression = (pluginExpression: string): boolean => pluginExpression.includes('*')

const isPluginPathExpression = (pluginExpression: string, pathService: Path.Path): boolean =>
  Match.value(pathService.isAbsolute(pluginExpression)).pipe(
    Match.when(true, () => true),
    Match.orElse(() => pluginExpression.startsWith('.')),
  )

const classifyPluginExpression = (
  pluginExpression: string,
  pathService: Path.Path,
): PluginExpressionClass =>
  Match.value(isPluginGlobExpression(pluginExpression)).pipe(
    Match.when(true, (): PluginExpressionClass => 'Glob'),
    Match.orElse(() => classifyPluginLocationExpression(pluginExpression, pathService)),
  )

const classifyPluginLocationExpression = (
  pluginExpression: string,
  pathService: Path.Path,
): PluginExpressionClass =>
  Match.value(isPluginPathExpression(pluginExpression, pathService)).pipe(
    Match.when(true, (): PluginExpressionClass => 'FilePath'),
    Match.orElse((): PluginExpressionClass => 'Module'),
  )

const resolvePluginFileUrl = (
  pluginExpression: string,
  pathService: Path.Path,
): Effect.Effect<string[], PluginLoadFailedError> =>
  pathService.toFileUrl(pathService.resolve(pluginExpression)).pipe(
    Effect.mapError((cause) => new PluginLoadFailedError({ descriptor: pluginExpression, cause })),
    Effect.map((url) => [url.href]),
  )

const resolvePluginExpression = (
  pluginExpression: string,
  pathService: Path.Path,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> =>
  Match.value(classifyPluginExpression(pluginExpression, pathService)).pipe(
    Match.when('Glob', () => globPluginModules(pluginExpression)),
    Match.when('FilePath', () => resolvePluginFileUrl(pluginExpression, pathService)),
    Match.when('Module', () => Effect.succeed([pluginExpression])),
    Match.exhaustive,
  )

function resolvePluginModules(
  pluginDescriptors: readonly string[],
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const results: string[][] = yield* Effect.forEach(
      pluginDescriptors,
      (pluginExpression: string) => resolvePluginExpression(pluginExpression, pathService),
      { concurrency: 'unbounded' },
    )
    return results.filter(Predicate.isNotNullish).flat()
  })
}

const pluginNamePattern = (pkg: string): RegExp => new RegExp(`^${pkg.replace('*', '.*')}`)

const isSelectablePluginName = (pluginName: string, pattern: RegExp): boolean =>
  Match.value(IGNORED_PACKAGES.includes(pluginName)).pipe(
    Match.when(true, () => false),
    Match.orElse(() => pattern.test(pluginName)),
  )

const qualifyPluginName = (org: string, pluginName: string): string =>
  Match.value(org.length > 0).pipe(
    Match.when(true, () => `${org}/${pluginName}`),
    Match.orElse(() => pluginName),
  )

const selectPluginNames = (org: string, pkg: string, pluginNames: readonly string[]): string[] => {
  const pattern = pluginNamePattern(pkg)
  return pluginNames
    .filter((pluginName: string) => isSelectablePluginName(pluginName, pattern))
    .map((pluginName: string) => qualifyPluginName(org, pluginName))
}

const warnExpressionNotListed = (
  pluginExpression: string,
  defaults: { readonly plugins: readonly string[] },
): Effect.Effect<void> =>
  Match.value(defaults.plugins.includes(pluginExpression)).pipe(
    Match.when(true, () => Effect.void),
    Match.orElse(() => Effect.logWarning(`Expression "${pluginExpression}" not resulted in plugins to load.`)),
  )

const warnUnmatchedExpression = (
  pluginExpression: string,
  plugins: readonly string[],
  defaults: { readonly plugins: readonly string[] },
): Effect.Effect<void> =>
  Match.value(plugins.length > 0).pipe(
    Match.when(true, () => Effect.void),
    Match.orElse(() => warnExpressionNotListed(pluginExpression, defaults)),
  )

function globPluginModules(
  pluginExpression: string,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const { org, pkg } = parsePluginExpression(pluginExpression)
    const pluginNames = yield* readOrgDirectory(org)
    const plugins = selectPluginNames(org, pkg, pluginNames)
    const defaults = yield* defaultOptions
    yield* warnUnmatchedExpression(pluginExpression, plugins, defaults)
    yield* Effect.forEach(
      plugins,
      (plugin: string) => Effect.logDebug(`Loading plugin "${plugin}" (matched with expression ${pluginExpression})`),
    )
    return plugins
  })
}

const emptyOrgEntries: readonly string[] = []

const installRootFor = (pathService: Path.Path, directory: string): string =>
  Match.value(pathService.basename(directory)).pipe(
    Match.when('node_modules', () => directory),
    Match.orElse(() => pathService.join(directory, 'node_modules')),
  )

const readOrgEntries = (
  fs: FileSystem.FileSystem,
  orgDirectory: string,
): Effect.Effect<readonly string[], PluginLoadFailedError> =>
  fs.readDirectory(orgDirectory).pipe(
    Effect.catchTag('PlatformError', (error) =>
      Match.value(error.reason).pipe(
        Match.tag('NotFound', () => Effect.succeed(emptyOrgEntries)),
        Match.orElse(() => Effect.fail(new PluginLoadFailedError({ descriptor: orgDirectory, cause: error }))),
      )),
    Effect.catch((error: unknown) =>
      Match.value(isEnoentError(error)).pipe(
        Match.when(true, () => Effect.succeed(emptyOrgEntries)),
        Match.orElse(() => Effect.fail(new PluginLoadFailedError({ descriptor: orgDirectory, cause: error }))),
      )
    ),
  )

const logFoundOrgPackages = (
  org: string,
  orgDirectory: string,
  entries: readonly string[],
): Effect.Effect<void> =>
  Match.value(entries.length > 0).pipe(
    Match.when(true, () => Effect.logDebug(`Found ${entries.length} ${org} packages in ${orgDirectory}`)),
    Match.orElse(() => Effect.void),
  )

const readOrgPackagesUpward = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  org: string,
  directory: string,
  names: HashSet.HashSet<string>,
): Effect.Effect<string[], PluginLoadFailedError> =>
  Effect.gen(function*() {
    const orgDirectory = pathService.resolve(installRootFor(pathService, directory), org)
    const entries = yield* readOrgEntries(fs, orgDirectory)
    yield* logFoundOrgPackages(org, orgDirectory, entries)
    const nextNames = entries.reduce((acc, entry) => HashSet.add(acc, entry), names)
    const parent = pathService.dirname(directory)
    return yield* Match.value(parent === directory).pipe(
      Match.when(true, () => Effect.succeed(Array.from(nextNames))),
      Match.orElse(() => readOrgPackagesUpward(fs, pathService, org, parent, nextNames)),
    )
  })

function readOrgDirectory(
  org: string,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const base = yield* pathService.fromFileUrl(new URL('.', import.meta.url)).pipe(Effect.orDie)
    return yield* readOrgPackagesUpward(fs, pathService, org, pathService.dirname(base), HashSet.empty())
  })
}

interface PluginContributions {
  readonly plugins: readonly PluginContribution<PluginKind>[] | undefined
  readonly schemaContribution: Record<string, unknown> | undefined
}

const isStrykerError = (error: unknown): error is StrykerError => error instanceof StrykerError

const pluginFailureCause = (error: unknown): unknown =>
  Match.value(error).pipe(
    Match.when(isStrykerError, (strykerError: StrykerError) => strykerError.cause),
    Match.orElse(() => error),
  )

const warnAbsentPlugin = (descriptor: string): Effect.Effect<void> =>
  Effect.logWarning(`Cannot find plugin "${descriptor}".\n  Did you forget to install it ?`).pipe(Effect.asVoid)

const failPluginLoad = (descriptor: string, error: unknown): Effect.Effect<never, PluginLoadFailedError> =>
  Effect.logWarning(`Error during loading "${descriptor}" plugin`).pipe(
    Effect.andThen(() => Effect.fail(new PluginLoadFailedError({ descriptor, cause: error }))),
  )

const recoverPluginImportFailure = (
  descriptor: string,
  error: unknown,
): Effect.Effect<void, PluginLoadFailedError> =>
  Match.value(isAbsentPluginError(pluginFailureCause(error), descriptor)).pipe(
    Match.when(true, () => warnAbsentPlugin(descriptor)),
    Match.orElse(() => failPluginLoad(descriptor, error)),
  )

const modulePluginContributions = (module: unknown): readonly PluginContribution<PluginKind>[] | undefined =>
  Match.value(module).pipe(
    Match.when(isPluginModule, (pluginModule: PluginModule) => pluginModule.strykerPlugins),
    Match.orElse((): undefined => undefined),
  )

const moduleSchemaContribution = (module: unknown): Record<string, unknown> | undefined =>
  Match.value(module).pipe(
    Match.when(
      hasValidationSchemaContribution,
      (contribution: SchemaValidationContribution) => contribution.strykerValidationSchema,
    ),
    Match.orElse((): undefined => undefined),
  )

const pluginContributionsOf = (module: unknown): PluginContributions => ({
  plugins: modulePluginContributions(module),
  schemaContribution: moduleSchemaContribution(module),
})

const hasContribution = (contributions: PluginContributions): boolean =>
  Match.value(contributions.plugins !== undefined).pipe(
    Match.when(true, () => true),
    Match.orElse(() => contributions.schemaContribution !== undefined),
  )

const warnUndescribedPluginModule = (descriptor: string): Effect.Effect<undefined> =>
  Effect.logWarning(
    `Module "${descriptor}" did not contribute a StrykerJS plugin. It didn't export a "strykerPlugins" or "strykerValidationSchema".`,
  ).pipe(Effect.as(undefined))

const describeLoadedPlugin = (
  descriptor: string,
  module: unknown,
): Effect.Effect<PluginContributions | undefined> =>
  Match.value(pluginContributionsOf(module)).pipe(
    Match.when(hasContribution, (contributions: PluginContributions) => Effect.succeed(contributions)),
    Match.orElse(() => warnUndescribedPluginModule(descriptor)),
  )

function loadPlugin(
  descriptor: string,
  basePath: string,
): Effect.Effect<PluginContributions | undefined, PluginLoadFailedError, Module | Path.Path> {
  return Effect.gen(function*() {
    yield* Effect.logDebug(`Loading plugin ${descriptor}`)
    const maybeModule = yield* importModule(descriptor, basePath).pipe(
      Effect.catch((error) => recoverPluginImportFailure(descriptor, error)),
    )
    return yield* Option.match(Option.fromUndefinedOr(maybeModule), {
      onNone: () => Effect.succeed(undefined),
      onSome: (module) => describeLoadedPlugin(descriptor, module),
    })
  })
}

interface PluginLoaderRawEntry {
  readonly moduleName: string
  readonly plugins: readonly PluginContribution<PluginKind>[] | undefined
  readonly schemaContribution: Record<string, unknown> | undefined
}
export function loadPlugins(
  pluginDescriptors: readonly string[],
  basePath: string,
): Effect.Effect<LoadedPlugins, PluginLoadFailedError, FileSystem.FileSystem | Module | Path.Path> {
  return Effect.gen(function*() {
    yield* FileSystem.FileSystem
    yield* Path.Path
    yield* Module
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
    const entries: readonly PluginLoaderRawEntry[] = loaded.map((entry) => ({
      moduleName: entry.moduleName,
      plugins: entry.plugins,
      schemaContribution: entry.schemaContribution,
    }))
    const plan = buildPluginLoadPlan(entries)
    for (const shadowing of plan.shadowings) {
      yield* Effect.logWarning(
        `Plugin "${shadowing.name}" of kind "${shadowing.kind}" at index ${shadowing.winnerIndex} shadows plugin at index ${shadowing.shadowedIndex}.`,
      )
    }
    const result: LoadedPlugins = {
      schemaContributions: plan.schemaContributions,
      pluginsByKind: plan.pluginsByKind,
    }
    return result
  })
}

const partsIncludeScope = (parts: readonly string[]): boolean =>
  Match.value(parts.length > 1).pipe(
    Match.when(true, () => parts[0]?.startsWith('@') === true),
    Match.orElse(() => false),
  )

function parsePluginExpression(pluginExpression: string): { org: string; pkg: string } {
  const parts = pluginExpression.split('/')
  return Match.value(partsIncludeScope(parts)).pipe(
    Match.when(
      true,
      (): { org: string; pkg: string } => ({
        org: parts.slice(0, 2).join('/').split('*')[0] ?? '',
        pkg: parts.slice(2).join('/'),
      }),
    ),
    Match.orElse((): { org: string; pkg: string } => ({
      org: '',
      pkg: pluginExpression,
    })),
  )
}

function isPluginModule(module: unknown): module is PluginModule {
  return S.is(PluginModuleSchema)(module)
}

function hasValidationSchemaContribution(module: unknown): module is SchemaValidationContribution {
  return S.is(SchemaValidationContributionSchema)(module)
}

const findContribution = <K extends PluginKind>(
  contributions: readonly AnyPluginContribution[],
  kind: K,
  name: string,
): Effect.Effect<PluginContribution<K>, PluginNotFoundError> =>
  Option.match(
    Option.fromUndefinedOr(
      contributions.find(
        (contribution): contribution is PluginContribution<K> =>
          contribution.kind === kind && contribution.name.toLowerCase() === name.toLowerCase(),
      ),
    ),
    {
      onNone: () =>
        Effect.fail(
          new PluginNotFoundError({
            descriptor: `${kind}:${name} (available: ${contributions.map((c) => c.name).join(', ')})`,
          }),
        ),
      onSome: (found) => Effect.succeed(found),
    },
  )

function findPlugin<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<PluginContribution<K>, PluginNotFoundError> {
  return Option.match(HashMap.get(pluginsByKind, kind), {
    onNone: () =>
      Effect.fail(
        new PluginNotFoundError({ descriptor: `${kind}:${name} (no ${kind} plugins were loaded)` }),
      ),
    onSome: (contributions) => findContribution(contributions, kind, name),
  })
}

export function create<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<PluginContribution<K>, PluginNotFoundError> {
  return findPlugin(pluginsByKind, kind, name)
}

export function createAll<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
): Effect.Effect<readonly PluginContribution<K>[]> {
  const contributions = HashMap.get(pluginsByKind, kind)
  if (Option.isNone(contributions)) {
    return Effect.succeed([])
  }
  return Effect.succeed(contributions.value.filter((c): c is PluginContribution<K> => c.kind === kind))
}
