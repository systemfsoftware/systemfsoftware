import { it, layer } from '@effect/vitest'
import { Contract, InMemory, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Context, Effect, FileSystem, Layer, Ref, Schema } from 'effect'

const TraceSuite = Suite.make({ it, layer })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const harness = Layer.merge(InMemory.layer(), discardingFileSystem)

class SharedBuild extends Context.Service<SharedBuild, { readonly built: number }>()('trace-spec/test/SharedBuild') {}
class ScenarioBuild extends Context.Service<ScenarioBuild, { readonly built: number }>()(
  'trace-spec/test/ScenarioBuild',
) {}

const sharedBuildsA = Ref.makeUnsafe(0)
const scenarioBuildsA = Ref.makeUnsafe(0)
const sharedBuildsB = Ref.makeUnsafe(0)

const sharedLayerA = Layer.effect(
  SharedBuild,
  Effect.map(Ref.updateAndGet(sharedBuildsA, (n) => n + 1), (built) => ({ built })),
)

const scenarioLayerA = Layer.merge(
  Layer.effect(
    ScenarioBuild,
    Effect.map(Ref.updateAndGet(scenarioBuildsA, (n) => n + 1), (built) => ({ built })),
  ),
  harness,
)

const sharedLayerB = Layer.effect(
  SharedBuild,
  Effect.map(Ref.updateAndGet(sharedBuildsB, (n) => n + 1), (built) => ({ built })),
)

const Probe = Span.declare({
  id: 'probe.layers',
  name: 'probe.layers',
  attrs: Schema.Struct({ 'shared.build': Schema.Finite, 'scenario.build': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make('probe-layers').pipe(Taxonomy.add(Probe))

const SharedProbe = Span.declare({
  id: 'probe.shared',
  name: 'probe.shared',
  attrs: Schema.Struct({ 'shared.build': Schema.Finite }),
})

const SharedTaxonomy = Taxonomy.make('probe-shared').pipe(Taxonomy.add(SharedProbe))

const probeStimulus = Stimulus.make({
  name: 'probe.layers',
  run: () =>
    Effect.gen(function*() {
      const shared = yield* SharedBuild
      const scenario = yield* ScenarioBuild
      return yield* Span.start(Probe, { 'shared.build': shared.built, 'scenario.build': scenario.built })(Effect.void)
    }),
})

const sharedProbeStimulus = Stimulus.make({
  name: 'probe.shared',
  run: () =>
    Effect.gen(function*() {
      const shared = yield* SharedBuild
      return yield* Span.start(SharedProbe, { 'shared.build': shared.built })(Effect.void)
    }),
})

const probeContract = (shared: number, scenario: number) =>
  Contract.of(ProbeTaxonomy)
    .stimulate(probeStimulus)
    .holds(Rel.attrs(Probe, { 'shared.build': shared, 'scenario.build': scenario }))

const sharedOnlyContract = (shared: number) =>
  Contract.of(SharedTaxonomy).stimulate(sharedProbeStimulus).holds(Rel.attrs(SharedProbe, { 'shared.build': shared }))

TraceSuite('suite layers')
  .withLayer(Layer.merge(sharedLayerA, harness))
  .withScenarioLayer(scenarioLayerA)
  .body(({ Case }) => {
    Case('the first case meets the first scenario build', probeContract(1, 1), undefined)
    Case('the second case meets the second scenario build on the same shared build', probeContract(1, 2), undefined)
  })

TraceSuite('suite shared layer alone')
  .withLayer(Layer.merge(sharedLayerB, harness))
  .body(({ Case }) => {
    Case(
      'the suite-wide layer carries the harness for a body without a scenario layer',
      sharedOnlyContract(1),
      undefined,
    )
  })
