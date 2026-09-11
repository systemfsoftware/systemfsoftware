import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'

import type { AnyPluginContribution, PluginContribution, PluginModule } from '@systemfsoftware/stryker-js/Plugin'
import { foldContributions } from '@systemfsoftware/stryker-js/Plugin'
import type { PluginKind, Shadowing } from '@systemfsoftware/stryker-js/Plugin'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'

import { importModule } from './Config.js'
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
  readonly shadowings: readonly Shadowing[]
}

export const buildPluginLoadPlan = (entries: readonly PluginLoaderEntryLike[]): PluginLoadPlan => {
  const shadowingState = entries.reduce<{
    readonly seen: HashMap.HashMap<string, number>
    readonly shadowings: readonly Shadowing[]
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

const FILE_URL_PREFIX = 'file://'

/**
 * A descriptor is either a module specifier or the file URL a path descriptor
 * was resolved to; a missing path is reported by `import` as the plain path,
 * so both texts name the descriptor.
 */
const descriptorTexts = (descriptor: string): readonly string[] =>
  Match.value(descriptor.startsWith(FILE_URL_PREFIX)).pipe(
    Match.when(true, (): readonly string[] => [descriptor, descriptor.slice(FILE_URL_PREFIX.length)]),
    Match.orElse((): readonly string[] => [descriptor]),
  )

const messageNamesDescriptor = (message: unknown, descriptor: string): boolean =>
  Match.value(message).pipe(
    Match.when(isText, (text: string) => descriptorTexts(descriptor).some((candidate) => text.includes(candidate))),
    Match.orElse(() => false),
  )

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

const ABSENT_MODULE_CODES: readonly string[] = ['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']

const isAbsentModuleCode = (code: unknown): boolean =>
  Match.value(code).pipe(
    Match.when(isText, (text: string) => ABSENT_MODULE_CODES.includes(text)),
    Match.orElse(() => false),
  )

/**
 * A plugin module is absent when the module system says the descriptor itself
 * cannot be found: `MODULE_NOT_FOUND` is what `require` raises for a bare
 * specifier, `ERR_MODULE_NOT_FOUND` what `import` raises for a file URL. A
 * dependency the plugin itself failed to resolve names a different module and
 * stays a load failure, not an absent plugin.
 */
export function isAbsentPluginError(error: unknown, descriptor: string): boolean {
  return Match.value(isAbsentModuleCode(errorCodeOf(error))).pipe(
    Match.when(true, () => messageNamesDescriptor(errorMessageOf(error), descriptor)),
    Match.orElse(() => false),
  )
}

type PluginLocationClass = 'FilePath' | 'Module'

const isPluginPathExpression = (pluginExpression: string, pathService: Path.Path): boolean =>
  Match.value(pathService.isAbsolute(pluginExpression)).pipe(
    Match.when(true, () => true),
    Match.orElse(() => pluginExpression.startsWith('.')),
  )

const classifyPluginExpression = (
  pluginExpression: string,
  pathService: Path.Path,
): PluginLocationClass =>
  Match.value(isPluginPathExpression(pluginExpression, pathService)).pipe(
    Match.when(true, (): PluginLocationClass => 'FilePath'),
    Match.orElse((): PluginLocationClass => 'Module'),
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
): Effect.Effect<string[], PluginLoadFailedError> =>
  Match.value(classifyPluginExpression(pluginExpression, pathService)).pipe(
    Match.when('FilePath', () => resolvePluginFileUrl(pluginExpression, pathService)),
    Match.when('Module', () => Effect.succeed([pluginExpression])),
    Match.exhaustive,
  )

function resolvePluginModules(
  pluginDescriptors: readonly string[],
): Effect.Effect<string[], PluginLoadFailedError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const results: string[][] = yield* Effect.forEach(
      pluginDescriptors,
      (pluginExpression: string) => resolvePluginExpression(pluginExpression, pathService),
      { concurrency: 'unbounded' },
    )
    return results.flat()
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

/**
 * A configured plugin whose module cannot be resolved is a configuration
 * fault, never a silent omission: the descriptor names the plugin and the
 * sentence names the likely cause.
 */
const pluginAbsentFault = (descriptor: string): PluginNotFoundError =>
  new PluginNotFoundError({
    descriptor: `${descriptor} (unresolvable plugin module — is the plugin's package installed?)`,
  })

const failAbsentPlugin = (descriptor: string): Effect.Effect<never, PluginNotFoundError> =>
  Effect.fail(pluginAbsentFault(descriptor))

const failPluginLoad = (descriptor: string, error: unknown): Effect.Effect<never, PluginLoadFailedError> =>
  Effect.logWarning(`Error during loading "${descriptor}" plugin`).pipe(
    Effect.andThen(() => Effect.fail(new PluginLoadFailedError({ descriptor, cause: error }))),
  )

const recoverPluginImportFailure = (
  descriptor: string,
  error: unknown,
): Effect.Effect<never, PluginLoadFailedError | PluginNotFoundError> =>
  Match.value(isAbsentPluginError(pluginFailureCause(error), descriptor)).pipe(
    Match.when(true, () => failAbsentPlugin(descriptor)),
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
): Effect.Effect<
  PluginContributions | undefined,
  PluginLoadFailedError | PluginNotFoundError,
  Module | Path.Path
> {
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
): Effect.Effect<LoadedPlugins, PluginLoadFailedError | PluginNotFoundError, Module | Path.Path> {
  return Effect.gen(function*() {
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
