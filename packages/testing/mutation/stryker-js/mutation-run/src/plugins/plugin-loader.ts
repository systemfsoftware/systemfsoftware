import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isErrnoException, propertyPath } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { PluginContribution } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { importModule } from '../config/module-loader.js'
import { defaultOptions } from '../config/options-validator.js'
import { StrykerError } from '../stryker-error.schema.js'

import {
  PluginLoadFailedError,
  PluginModuleSchema,
  SchemaValidationContributionSchema,
} from './plugin-loader.schema.js'
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
  log: Logger,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const results: string[][] = yield* Effect.forEach(
      pluginDescriptors,
      (pluginExpression: string) =>
        Effect.gen(function*() {
          if (pluginExpression.includes('*')) {
            return yield* globPluginModules(pluginExpression, log)
          }
          if (path.isAbsolute(pluginExpression) || pluginExpression.startsWith('.')) {
            return [pathToFileURL(pathService.resolve(pluginExpression)).toString()]
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
  log: Logger,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const { org, pkg } = parsePluginExpression(pluginExpression)
    const regexp = new RegExp(`^${pkg.replace('*', '.*')}`)
    const pluginNames = yield* readOrgDirectory(org, log)
    const plugins = pluginNames
      .filter((pluginName: string) => !IGNORED_PACKAGES.includes(pluginName) && regexp.test(pluginName))
      .map((pluginName: string) => `${org.length > 0 ? `${org}/` : ''}${pluginName}`)
    const defaults = yield* defaultOptions
    if (plugins.length === 0 && !defaults.plugins.includes(pluginExpression)) {
      log.warn('Expression "%s" not resulted in plugins to load.', pluginExpression)
    }
    for (const plugin of plugins) {
      log.debug('Loading plugin "%s" (matched with expression %s)', plugin, pluginExpression)
    }
    return plugins
  })
}

function readOrgDirectory(
  org: string,
  log: Logger,
): Effect.Effect<string[], PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    let names: HashSet.HashSet<string> = HashSet.empty()
    let directory = path.dirname(fileURLToPath(import.meta.url))
    for (;;) {
      const installRoot = path.basename(directory) === 'node_modules' ? directory : path.join(directory, 'node_modules')
      const orgDirectory = path.resolve(installRoot, org)
      const entriesEffect = fs.readDirectory(orgDirectory).pipe(
        Effect.tap((entries: ReadonlyArray<string>) => {
          if (entries.length > 0) {
            log.debug('Found %d %s packages in %s', entries.length, org, orgDirectory)
            for (const entry of entries) {
              names = HashSet.add(names, entry)
            }
          }
          return Effect.void
        }),
        Effect.catchTag('PlatformError', (error) =>
          Match.value(error.reason).pipe(
            Match.tag('NotFound', () => Effect.succeed([] as string[])),
            Match.orElse(() => Effect.fail(new PluginLoadFailedError({ descriptor: orgDirectory, cause: error }))),
          )),
        Effect.catch((error: unknown) => {
          if (isEnoentError(error)) {
            return Effect.succeed([] as string[])
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
  log: Logger,
  basePath: string,
): Effect.Effect<
  | {
    plugins: readonly PluginContribution<PluginKind>[] | undefined
    schemaContribution: Record<string, unknown> | undefined
  }
  | undefined,
  PluginLoadFailedError
> {
  return Effect.gen(function*() {
    log.debug('Loading plugin %s', descriptor)
    const moduleEffect = importModule(descriptor, basePath).pipe(
      Effect.catch((error) => {
        const cause = error instanceof StrykerError ? error.cause : error
        if (isAbsentPluginError(cause, descriptor)) {
          log.warn('Cannot find plugin "%s".\n  Did you forget to install it ?', descriptor)
          return Effect.void
        }
        log.warn('Error during loading "%s" plugin', descriptor)
        return Effect.fail(new PluginLoadFailedError({ descriptor, cause: error }))
      }),
    )
    const maybeModule = yield* moduleEffect
    if (maybeModule === undefined) {
      return undefined
    }
    const module = maybeModule
    const plugins = isPluginModule(module) ? module.strykerPlugins : undefined
    const schemaContribution = hasValidationSchemaContribution(module)
      ? module.strykerValidationSchema
      : undefined
    if (plugins !== undefined || schemaContribution !== undefined) {
      return {
        plugins,
        schemaContribution,
      }
    }
    log.warn(
      'Module "%s" did not contribute a StrykerJS plugin. It didn\'t export a "%s" or "%s".',
      descriptor,
      propertyPath<PluginModule>()('strykerPlugins'),
      propertyPath<SchemaValidationContribution>()('strykerValidationSchema'),
    )
    return undefined
  })
}

export function loadPlugins(
  pluginDescriptors: readonly string[],
  log: Logger,
  basePath: string,
): Effect.Effect<LoadedPlugins, PluginLoadFailedError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const pluginModules = yield* resolvePluginModules(pluginDescriptors, log)
    const loadedPluginModules = yield* Effect.forEach(
      pluginModules,
      (moduleName: string) =>
        loadPlugin(moduleName, log, basePath).pipe(
          Effect.map((plugin) =>
            plugin === undefined
              ? undefined
              : {
                ...plugin,
                moduleName,
              }
          ),
        ),
      { concurrency: 'unbounded' },
    ).pipe(Effect.map((arr) => arr.filter(Predicate.isNotNullish)))

    let seen: HashMap.HashMap<string, number> = HashMap.empty()
    const shadowings: Array<{ kind: PluginKind; name: string; shadowedIndex: number; winnerIndex: number }> = []
    let index = 0
    for (const entry of loadedPluginModules) {
      const plugins = entry.plugins
      if (plugins === undefined) {
        index += 1
        continue
      }
      for (const plugin of plugins) {
        const key = `${plugin.kind}:${plugin.name}`
        const previousOption = HashMap.get(seen, key)
        if (Option.isSome(previousOption)) {
          shadowings.push({
            kind: plugin.kind,
            name: plugin.name,
            shadowedIndex: previousOption.value,
            winnerIndex: index,
          })
        }
        seen = HashMap.set(seen, key, index)
      }
      index += 1
    }
    for (const shadowing of shadowings) {
      log.warn(
        `Plugin "${shadowing.name}" of kind "${shadowing.kind}" at index ${shadowing.winnerIndex} shadows plugin at index ${shadowing.shadowedIndex}.`,
      )
    }

    let pluginsByKind: HashMap.HashMap<PluginKind, readonly PluginContribution<PluginKind>[]> = HashMap.empty()
    const schemaContributions: Array<Record<string, unknown>> = []
    const pluginModulePaths: Array<string> = []

    for (const entry of loadedPluginModules) {
      const { plugins, schemaContribution, moduleName } = entry
      if (plugins !== undefined) {
        pluginModulePaths.push(moduleName)
        for (const plugin of plugins) {
          const existingOption = HashMap.get(pluginsByKind, plugin.kind)
          if (Option.isSome(existingOption)) {
            pluginsByKind = HashMap.set(pluginsByKind, plugin.kind, [...existingOption.value, plugin])
          } else {
            pluginsByKind = HashMap.set(pluginsByKind, plugin.kind, [plugin])
          }
        }
      }
      if (schemaContribution !== undefined) {
        schemaContributions.push(schemaContribution)
      }
    }

    return {
      schemaContributions,
      pluginsByKind,
      pluginModulePaths,
    }
  })
}

function parsePluginExpression(pluginExpression: string): { org: string; pkg: string } {
  const parts = pluginExpression.split('/')
  if (parts.length > 1 && parts[0]?.startsWith('@')) {
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
