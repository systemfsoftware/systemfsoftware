import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

import { Checker } from './Checker.js'
import type { Evaluator } from './Evaluator.js'
import { Ignorer } from './Ignorer.js'
import { Module } from './Module.js'
import { PluginContribution, PluginKind, Shadowing } from './Plugin.schema.js'
import { Reporter } from './Reporter.js'
import type { ReporterService } from './Reporter.js'
import type { StrykerOptions } from './Schema.js'
import { TestRunner } from './TestRunner.js'

export { PluginContribution, PluginKind, Shadowing } from './Plugin.schema.js'

export class RunConfiguration extends Context.Service<RunConfiguration, StrykerOptions>()(
  '~@systemfsoftware/stryker-js/RunConfiguration',
) {}

export class SandboxDirectory extends Context.Service<SandboxDirectory, string>()(
  '~@systemfsoftware/stryker-js/SandboxDirectory',
) {}

// ---------------------------------------------------------------------------
// Namespace — required surface: Kind, Environment, ContributionOf
// ---------------------------------------------------------------------------

export interface PluginInterfaces {
  Checker: Checker
  TestRunner: TestRunner
  Reporter: Reporter
  Ignore: Ignorer
  Evaluator: Evaluator
}
export type PluginEnvironment = RunConfiguration | SandboxDirectory | FileSystem.FileSystem | Module | Path.Path

export type AnyPluginContribution = { [K in PluginKind]: PluginContribution<K> }[PluginKind]

export type ContributionOf<K extends PluginKind> = Extract<AnyPluginContribution, { readonly kind: K }>

// ---------------------------------------------------------------------------
// Declaration
// ---------------------------------------------------------------------------

export function declarePlugin<K extends PluginKind>(
  kind: K,
  name: string,
  layer: Layer.Layer<PluginInterfaces[K], never, PluginEnvironment>,
): PluginContribution<K> {
  return new PluginContribution({ kind, name, layer })
}

export type MergedPluginServices = Checker & Ignorer & Reporter & TestRunner

export interface ComposedPlugins {
  readonly layer: Option.Option<Layer.Layer<MergedPluginServices, never, PluginEnvironment>>
  readonly shadowings: readonly Shadowing[]
}

// ---------------------------------------------------------------------------
// Composition — pure fold, no logger, Effect.logWarning for reporter failures only
// ---------------------------------------------------------------------------

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
  // MutableHashMap is the repo's collection type; it is Iterable<[K,V]> and
  // its values are accessed via the module function, not a method.
  const allResolved = Array.from(MutableHashMap.values(resolved))
  const reporterContributions = allResolved.filter(
    (c): c is ContributionOf<'Reporter'> => c.kind === 'Reporter',
  )
  const nonReporterLayers: Array<Layer.Layer<never, never, PluginEnvironment>> = allResolved
    .filter((c) => c.kind !== 'Reporter')
    .map((contribution) => contribution.layer)
  let broadcastLayer: Layer.Layer<Reporter, never, PluginEnvironment> | undefined
  if (reporterContributions.length > 0) {
    broadcastLayer = Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const config = yield* RunConfiguration
        const wantedNames: Record<string, true> = {}
        for (const name of config.reporters) {
          wantedNames[name.toLowerCase()] = true
        }
        const selected = reporterContributions.filter((c) => c.name.toLowerCase() in wantedNames)
        const sandboxOption = yield* Effect.serviceOption(SandboxDirectory)
        const namedReporters: Array<{ readonly name: string; readonly reporter: ReporterService }> = []
        for (const contribution of selected) {
          const base = Layer.build(contribution.layer)
          let buildEffect = base.pipe(Effect.provideService(RunConfiguration, config))
          if (Option.isSome(sandboxOption)) {
            buildEffect = buildEffect.pipe(Effect.provideService(SandboxDirectory, sandboxOption.value))
          }
          const ctx = yield* buildEffect
          const reporter = Context.get(ctx, Reporter)
          namedReporters.push({ name: contribution.name, reporter })
        }

        const toEach = <E, R>(
          event: string,
          call: (reporter: ReporterService) => Effect.Effect<void, E, R>,
        ): Effect.Effect<void, never, R> =>
          Effect.forEach(
            namedReporters,
            ({ name, reporter }) =>
              call(reporter).pipe(
                Effect.catchCause((cause) =>
                  Effect.logWarning(`Reporter "${name}" failed handling ${event}`).pipe(
                    Effect.annotateLogs('cause', cause),
                  )
                ),
              ),
            { concurrency: 'unbounded', discard: true },
          )

        const broadcast: ReporterService = {
          onDryRunCompleted: (event) => toEach('onDryRunCompleted', (r) => r.onDryRunCompleted(event)),
          onMutationTestingPlanReady: (event) =>
            toEach('onMutationTestingPlanReady', (r) => r.onMutationTestingPlanReady(event)),
          onMutantTested: (result) => toEach('onMutantTested', (r) => r.onMutantTested(result)),
          onMutationTestReportReady: (report, metrics) =>
            toEach('onMutationTestReportReady', (r) => r.onMutationTestReportReady(report, metrics)),
          wrapUp: toEach('wrapUp', (r) => r.wrapUp),
        }

        return broadcast
      }),
    )
  }

  const allLayers: Array<Layer.Layer<never, never, PluginEnvironment>> = [...nonReporterLayers]
  if (broadcastLayer !== undefined) {
    allLayers.push(broadcastLayer)
  }

  if (allLayers.length === 0) {
    return { layer: Option.none(), shadowings }
  }
  // The layers in allLayers each provide a single service; merging them
  // yields the intersection MergedPluginServices. The reduce's inferred
  // Layer<never> is widened via annotation to the intended bound.
  const merged: Layer.Layer<MergedPluginServices, never, PluginEnvironment> = allLayers.reduce((acc, next) =>
    Layer.merge(acc, next)
  )
  return { layer: Option.some(merged), shadowings }
}
