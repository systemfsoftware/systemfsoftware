import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'

import type { PluginKind } from '@systemfsoftware/stryker-js/Plugin'
import type { PluginContribution } from '@systemfsoftware/stryker-js/Plugin'

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
