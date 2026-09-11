import * as Context from 'effect/Context'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
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
    shadowings.push(
      ...Option.match(previous, {
        onNone: () => [],
        onSome: (shadowedIndex) => [
          new Shadowing({
            kind: String(contribution.kind),
            name: contribution.name,
            shadowedIndex,
            winnerIndex: index,
          }),
        ],
      }),
    )
    MutableHashMap.set(resolved, key, contribution)
    MutableHashMap.set(lastSeen, key, index)
  }

  return { resolved, shadowings }
}

const reporterFactoryOf = (contribution: AnyPluginContribution): readonly SelectedReporterFactory[] =>
  Match.value(contribution).pipe(
    Match.discriminator('kind')('Reporter', (reporter): readonly SelectedReporterFactory[] => [
      { name: reporter.name, make: reporter.make },
    ]),
    Match.orElse((): readonly SelectedReporterFactory[] => []),
  )

const layerOf = (contribution: AnyPluginContribution): readonly Layer.Layer<never, never, PluginEnvironment>[] =>
  Match.value(contribution).pipe(
    Match.discriminator('kind')('Reporter', (): readonly Layer.Layer<never, never, PluginEnvironment>[] => []),
    Match.orElse((nonReporter) => [nonReporter.layer]),
  )

const mergedLayer = (
  layers: ReadonlyArray<Layer.Layer<never, never, PluginEnvironment>>,
): Layer.Layer<MergedPluginServices, never, PluginEnvironment> =>
  layers.reduce((accumulated, next) => Layer.merge(accumulated, next))

export function composePlugins(contributions: readonly AnyPluginContribution[]): ComposedPlugins {
  const { resolved, shadowings } = foldContributions(contributions)
  const allResolved = Array.from(MutableHashMap.values(resolved))
  const layers = allResolved.flatMap(layerOf)
  return {
    layer: Option.map(Option.fromUndefinedOr(layers.at(0)), () => mergedLayer(layers)),
    reporterFactories: allResolved.flatMap(reporterFactoryOf),
    shadowings,
  }
}
