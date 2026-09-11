import * as Context from 'effect/Context'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

import { Checker } from './Checker.js'
import type { Evaluator } from './Evaluator.js'
import { Ignorer } from './Ignorer.js'
import { Module } from './Module.js'
import {
  type PluginContribution,
  PluginKind,
  PluginLayerContribution,
  type PluginLayerKind,
  PluginReporterContribution,
  Shadowing,
} from './Plugin.schema.js'
import type { ReporterFactory } from './ReporterEvent.schema.js'
import type { StrykerOptions } from './Schema.js'
import { TestRunner } from './TestRunner.js'

export {
  type PluginContribution,
  PluginKind,
  PluginLayerContribution,
  type PluginLayerKind,
  PluginReporterContribution,
  Shadowing,
} from './Plugin.schema.js'

export class RunConfiguration extends Context.Service<RunConfiguration, StrykerOptions>()(
  '~@systemfsoftware/stryker-js/RunConfiguration',
) {}

export class SandboxDirectory extends Context.Service<SandboxDirectory, string>()(
  '~@systemfsoftware/stryker-js/SandboxDirectory',
) {}

export interface PluginInterfaces {
  Checker: Checker
  TestRunner: TestRunner
  Ignore: Ignorer
  Evaluator: Evaluator
}
export type PluginEnvironment = RunConfiguration | SandboxDirectory | FileSystem.FileSystem | Module | Path.Path

export type AnyPluginContribution = { [K in PluginKind]: PluginContribution<K> }[PluginKind]

export type ContributionOf<K extends PluginKind> = Extract<AnyPluginContribution, { readonly kind: K }>

export function declarePlugin(
  kind: 'Reporter',
  name: string,
  make: ReporterFactory,
): PluginContribution<'Reporter'>
export function declarePlugin<K extends PluginLayerKind>(
  kind: K,
  name: string,
  layer: Layer.Layer<PluginInterfaces[K], never, PluginEnvironment>,
): PluginContribution<K>
export function declarePlugin(kind: PluginKind, name: string, payload: unknown): AnyPluginContribution {
  if (kind === 'Reporter') {
    return new PluginReporterContribution({ kind, name, make: payload })
  }
  return new PluginLayerContribution({ kind, name, layer: payload })
}

export type MergedPluginServices = Checker & Ignorer & TestRunner

export interface SelectedReporterFactory {
  readonly name: string
  readonly make: ReporterFactory
}

export interface ComposedPlugins {
  readonly layer: Option.Option<Layer.Layer<MergedPluginServices, never, PluginEnvironment>>
  readonly reporterFactories: readonly SelectedReporterFactory[]
  readonly shadowings: readonly Shadowing[]
}

function foldContributions(
  contributions: readonly AnyPluginContribution[],
): {
  readonly resolved: MutableHashMap.MutableHashMap<string, AnyPluginContribution>
  readonly shadowings: readonly Shadowing[]
} {
  const resolved = MutableHashMap.empty<string, AnyPluginContribution>()
  const shadowings: Array<Shadowing> = []
  const lastSeen = MutableHashMap.empty<string, number>()

  for (const [index, contribution] of contributions.entries()) {
    const key = `${contribution.kind}:${contribution.name}`
    const previous = MutableHashMap.get(lastSeen, key)
    if (Option.isSome(previous)) {
      shadowings.push(
        new Shadowing({
          kind: String(contribution.kind),
          name: contribution.name,
          shadowedIndex: previous.value,
          winnerIndex: index,
        }),
      )
    }
    MutableHashMap.set(resolved, key, contribution)
    MutableHashMap.set(lastSeen, key, index)
  }

  return { resolved, shadowings }
}

export function composePlugins(
  contributions: readonly AnyPluginContribution[],
): ComposedPlugins {
  const { resolved, shadowings } = foldContributions(contributions)
  const allResolved = Array.from(MutableHashMap.values(resolved))
  const reporterFactories: Array<SelectedReporterFactory> = []
  const nonReporterLayers: Array<Layer.Layer<never, never, PluginEnvironment>> = []
  for (const contribution of allResolved) {
    if (contribution.kind === 'Reporter') {
      reporterFactories.push({ name: contribution.name, make: contribution.make })
      continue
    }
    nonReporterLayers.push(contribution.layer)
  }

  const allLayers: Array<Layer.Layer<never, never, PluginEnvironment>> = [...nonReporterLayers]

  if (allLayers.length === 0) {
    return { layer: Option.none(), reporterFactories, shadowings }
  }
  const merged: Layer.Layer<MergedPluginServices, never, PluginEnvironment> = allLayers.reduce((acc, next) =>
    Layer.merge(acc, next)
  )
  return { layer: Option.some(merged), reporterFactories, shadowings }
}
