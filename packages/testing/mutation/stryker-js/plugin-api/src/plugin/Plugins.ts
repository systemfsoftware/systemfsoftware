/// <reference types="vitest/importMeta" />
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { Checker } from '../check/index.js'
import { Evaluator } from '../evaluate/index.js'
import type { Ignorer } from '../ignore/index.js'
import { Reporter } from '../report/index.js'
import { TestRunner } from '../test-runner/index.js'

import { PluginKind } from './PluginKind.js'

/**
 * Maps each `PluginKind` to the port it contributes.
 *
 * Ports are `Context.Service` classes (except `Ignorer`, which stays a plain
 * synchronous predicate — lifting it to `Effect` would force every call site
 * to run an Effect for a pure value). A `Layer` that provides one is the
 * construction recipe; the plugin declaration no longer needs to know whether
 * that recipe came from a class, a factory, or a value.
 */
export interface PluginInterfaces {
  [PluginKind.Checker]: Checker
  [PluginKind.TestRunner]: TestRunner
  [PluginKind.Reporter]: Reporter
  [PluginKind.Ignore]: Ignorer
  [PluginKind.Evaluator]: Evaluator
}

const pluginContributionTag = { _tag: 'PluginContribution' } as const
type PluginContributionTag = typeof pluginContributionTag

/**
 * A plugin declares what it contributes, and the contribution carries the
 * `Layer` that provides the port.
 *
 * Three declaration forms existed only because the container needed to know
 * how to *construct* the value — class, factory, or value. A `Layer` already
 * encodes construction, so the distinction disappears: the caller builds the
 * `Layer` however it wants (succeed, effect, merge, provide) and hands it
 * over as a single shape. No `Promise` is involved; every operation on the
 * port is an `Effect` and the engine decides when to run it.
 *
 * Outcomes are not errors. A failing test, a surviving mutant, or a compile
 * error is a value on the success channel. The error channel is only for the
 * plugin itself breaking.
 */
export interface PluginContribution<K extends PluginKind> extends PluginContributionTag {
  readonly kind: K
  readonly name: string
  readonly layer: Layer.Layer<PluginInterfaces[K]>
}

/**
 * Declare a plugin contribution.
 *
 * The `Layer` already encodes how the port is built, so one function replaces
 * `declareClassPlugin` / `declareFactoryPlugin` / `declareValuePlugin`.
 * `R` is `never` — a plugin's own dependencies come from the `Layer` that
 * builds it, never from the interface.
 */
export function declarePlugin<K extends PluginKind>(
  kind: K,
  name: string,
  layer: Layer.Layer<PluginInterfaces[K]>,
): PluginContribution<K> {
  return { _tag: 'PluginContribution', kind, name, layer }
}

/**
 * A shadowing records that a later contribution overwrote an earlier one for
 * the same `(kind, name)` key.
 *
 * The mechanism replaces container registration order. Without recording,
 * "last one wins by accident from import order" is silent and the engine
 * cannot warn that a plugin was shadowed.
 */
export interface Shadowing {
  readonly kind: PluginKind
  readonly name: string
  readonly shadowedIndex: number
  readonly winnerIndex: number
}

/**
 * What `composePlugins` returns: the `Layer` the engine provides, plus the
 * shadowings it must report.
 *
 * `layer` is an `Option` because a run configured with no plugins is legal and
 * produces no services. It cannot be a `Layer` defaulted to `Layer.empty`:
 * `Layer`'s `ROut` is contravariant (`Layer<in ROut, ...>` at
 * `repos/effect/packages/effect/src/Layer.ts:54`), so `Layer<never>` is the
 * SUPERtype of `Layer<Checker | TestRunner | ...>` and no empty value of the
 * narrower type exists. Forcing one requires a cast, which would trade a real,
 * handleable case for an unchecked assertion — so the caller states what it does
 * with "no plugins" instead.
 */
export interface ComposedPlugins {
  readonly layer: Option.Option<Layer.Layer<PluginInterfaces[PluginKind]>>
  readonly shadowings: readonly Shadowing[]
}

/** The `(kind, name)` identity of a contribution. Plugins differing in either coordinate are distinct. */
function contributionKey(contribution: PluginContribution<PluginKind>): string {
  return `${contribution.kind}:${contribution.name}`
}

/**
 * Fold a contribution list to a last-wins map and the shadowings it applied.
 *
 * Private on purpose. A consumer wants the composed `Layer`, not the fold's
 * intermediate map: publishing the map would make the resolution strategy part
 * of the surface, so changing it later would break callers who had started
 * reading it. `composePlugins` is the whole public story.
 *
 * Pure and total — allocates a new `Map` and array, never throws. Every
 * non-first occurrence of a key records one `Shadowing` naming the index it
 * displaced and the index that won, which is what turns "last one wins by
 * accident from import order" into something the engine can report.
 */
function foldContributions(
  contributions: readonly PluginContribution<PluginKind>[],
): {
  readonly resolved: ReadonlyMap<string, PluginContribution<PluginKind>>
  readonly shadowings: readonly Shadowing[]
} {
  const resolved = new Map<string, PluginContribution<PluginKind>>()
  const shadowings: Array<Shadowing> = []
  const lastSeen = new Map<string, number>()

  for (let index = 0; index < contributions.length; index += 1) {
    const contribution = contributions[index]
    if (contribution === undefined) {
      continue
    }
    const key = contributionKey(contribution)
    const previous = lastSeen.get(key)
    if (previous !== undefined) {
      shadowings.push({
        kind: contribution.kind,
        name: contribution.name,
        shadowedIndex: previous,
        winnerIndex: index,
      })
    }
    resolved.set(key, contribution)
    lastSeen.set(key, index)
  }

  return { resolved, shadowings }
}

/**
 * Compose declared plugin contributions into the `Layer` the engine provides,
 * plus the shadowings it should report.
 *
 * This replaces container registration. Registration mutated shared host state
 * as a side effect of importing a module, so the composed configuration existed
 * only after every import had run and could not be inspected without running
 * them. A fold over declared data is inspectable before anything is provided,
 * which is what makes plugin precedence debuggable rather than emergent.
 *
 * The merge has no seed value: `Layer`'s `ROut` is contravariant, so there is no
 * empty `Layer` of the narrower type to fold from (see `ComposedPlugins`). The
 * empty list therefore returns `Option.none()` rather than a synthesised layer.
 */
export function composePlugins(
  contributions: readonly PluginContribution<PluginKind>[],
): ComposedPlugins {
  const { resolved, shadowings } = foldContributions(contributions)
  const layers: readonly Layer.Layer<PluginInterfaces[PluginKind]>[] = [...resolved.values()]
    .map((contribution) => contribution.layer)

  return {
    layer: layers.length === 0
      ? Option.none()
      : Option.some(layers.reduce((merged, next) => Layer.merge(merged, next))),
    shadowings,
  }
}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const Context = await import('effect/Context')
  const Effect = await import('effect/Effect')
  const LayerDynamic = await import('effect/Layer')
  const Option = await import('effect/Option')
  const { DryRunStatus } = await import('../test-runner/DryRunStatus.js')
  const { MutantRunStatus } = await import('../test-runner/MutantRunResult.js')

  const checkerLayer = LayerDynamic.succeed(Checker, {
    init: Effect.void,
    check: () => Effect.succeed(new Map()),
    group: () => Effect.succeed([]),
  })

  const testRunnerLayer = LayerDynamic.succeed(TestRunner, {
    capabilities: Effect.succeed({ reloadEnvironment: true }),
    init: Effect.void,
    dryRun: () => Effect.succeed({ status: DryRunStatus.Complete, tests: [] }),
    mutantRun: () => Effect.succeed({ status: MutantRunStatus.Survived, nrOfTests: 0 }),
    dispose: Effect.void,
  })

  const reporterLayer = LayerDynamic.succeed(Reporter, {
    onDryRunCompleted: () => Effect.void,
    onMutationTestingPlanReady: () => Effect.void,
    onMutantTested: () => Effect.void,
    onMutationTestReportReady: () => Effect.void,
    wrapUp: Effect.void,
  })

  const evaluatorLayer = LayerDynamic.succeed(Evaluator, {
    evaluate: () => Effect.void,
  })

  const ignorerTag = Context.Service<Ignorer>('test/Ignorer')
  const ignorerLayer = LayerDynamic.succeed(ignorerTag, {
    shouldIgnore: () => Option.none(),
  })

  const sharedLayer = LayerDynamic.mergeAll(
    checkerLayer,
    testRunnerLayer,
    reporterLayer,
    evaluatorLayer,
    ignorerLayer,
  )

  const nameArb = fc.constantFrom('a', 'b', 'c', 'd')
  const kindArb = fc.constantFrom(
    PluginKind.Checker,
    PluginKind.TestRunner,
    PluginKind.Reporter,
    PluginKind.Ignore,
    PluginKind.Evaluator,
  )

  const contributionArb = fc.record({ kind: kindArb, name: nameArb }).map(
    ({ kind, name }) => declarePlugin(kind, name, sharedLayer),
  )

  const keyOf = (c: PluginContribution<PluginKind>): string => `${c.kind}:${c.name}`

  describe('foldContributions', () => {
    // Each property is an invariant the fold must satisfy, never a second copy
    // of the fold's own loop: an oracle that re-derives the answer the same way
    // agrees with the implementation whenever both are wrong together.
    //
    // Every predicate is one traversal. Where the invariant is "for all keys",
    // the case draws ONE index and `numRuns` supplies the quantifier, which is
    // what keeps per-case cost linear in the draw instead of quadratic.
    it.prop(
      '∀xs_Fold_≡LastWins',
      [fc.array(contributionArb, { minLength: 1, maxLength: 10 }), fc.nat()],
      ([contributions, offset]) => {
        const probe = contributions[offset % contributions.length]
        if (probe === undefined) return true
        const key = `${probe.kind}:${probe.name}`

        let expected: PluginContribution<PluginKind> | undefined
        for (const candidate of contributions) {
          if (`${candidate.kind}:${candidate.name}` === key) expected = candidate
        }
        return foldContributions(contributions).resolved.get(key) === expected
      },
    )

    it.prop(
      '∀xs_Fold_=ResolvesDistinctKeys',
      [fc.array(contributionArb, { maxLength: 10 })],
      ([contributions]) => {
        const keys = new Set<string>()
        for (const c of contributions) keys.add(`${c.kind}:${c.name}`)
        return foldContributions(contributions).resolved.size === keys.size
      },
    )

    it.prop(
      '∀xs_Fold_=ConservesCount',
      [fc.array(contributionArb, { maxLength: 10 })],
      ([contributions]) => {
        const { resolved, shadowings } = foldContributions(contributions)
        // Every contribution either wins its key or shadows an earlier one, so
        // the two counts account for the input exactly once each.
        return shadowings.length === contributions.length - resolved.size
      },
    )

    it.prop(
      '∀xs_Fold_≠OrderIndependent',
      [fc.array(contributionArb, { minLength: 2, maxLength: 10 })],
      ([contributions]) => {
        const seen = new Set<string>()
        let repeated: string | undefined
        for (const c of contributions) {
          const key = `${c.kind}:${c.name}`
          if (seen.has(key)) repeated = key
          seen.add(key)
        }
        // Only a repeated key can witness order dependence; with none, the fold
        // is order-independent and the property is vacuous rather than false.
        if (repeated === undefined) return true

        const forward = foldContributions(contributions).resolved.get(repeated)
        const backward = foldContributions([...contributions].reverse()).resolved.get(repeated)
        return forward !== backward
      },
    )

    it.prop(
      '∀xs_Fold_≡Idempotent',
      [fc.array(contributionArb, { maxLength: 10 })],
      ([contributions]) => {
        const once = foldContributions(contributions)
        const twice = foldContributions([...once.resolved.values()])
        // Folding the winners changes nothing and shadows nothing: the fold has
        // reached a fixed point, which is what makes it safe to compose twice.
        return twice.shadowings.length === 0 && twice.resolved.size === once.resolved.size
      },
    )
  })
}
