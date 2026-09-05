import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'

import type { PluginKind } from '@systemfsoftware/stryker-js/Plugin'
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

export interface PluginLoaderEntryLike {
  readonly moduleName: string
  readonly plugins: readonly PluginContribution<PluginKind>[] | undefined
  readonly schemaContribution: Record<string, unknown> | undefined
}

export interface PluginLoadPlan {
  readonly schemaContributions: readonly Record<string, unknown>[]
  readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly PluginContribution<PluginKind>[]>
  readonly pluginModulePaths: readonly string[]
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

  const pluginModulePaths = entries.flatMap((entry) =>
    Option.match(Option.fromUndefinedOr(entry.plugins), {
      onNone: () => [],
      onSome: () => [entry.moduleName],
    })
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
    pluginModulePaths,
    shadowings: shadowingState.shadowings,
  }
}

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
      pluginModulePaths: plan.pluginModulePaths,
    }
    return result
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
