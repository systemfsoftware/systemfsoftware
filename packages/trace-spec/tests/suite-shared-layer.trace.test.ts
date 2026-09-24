import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, FileSystem, Layer, Ref, Schema } from 'effect'

const TraceSuite = Suite.make({ it })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const harness = Layer.merge(ObservationWindow.make('trace-spec').layer, discardingFileSystem)

class Lifecycle
  extends Context.Service<Lifecycle, { readonly peek: Effect.Effect<number>; readonly next: Effect.Effect<number> }>()(
    'trace-spec/test/Lifecycle',
  )
{}
class Lens extends Context.Service<Lens, { readonly build: number }>()('trace-spec/test/Lens') {}

const sharedLayer = Layer.effect(
  Lifecycle,
  Effect.gen(function*() {
    const count = yield* Ref.make(0)
    return { peek: Ref.get(count), next: Ref.updateAndGet(count, (current) => current + 1) }
  }),
)

const scenarioLayer: Layer.Layer<Lens, never, Lifecycle | OtelTracer.OtelTracer> = Layer.effect(
  Lens,
  Effect.map(Effect.flatMap(Lifecycle, (lifecycle) => lifecycle.next), (build) => ({ build })),
)

const LensSpan = Span.declare({
  id: 'lens.build',
  name: 'lens.build',
  attrs: Schema.Struct({ 'lens.build': Schema.Finite }),
})
const LifecycleSpan = Span.declare({
  id: 'lifecycle.build',
  name: 'lifecycle.build',
  attrs: Schema.Struct({ 'lifecycle.build': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make('probe-layers').pipe(Taxonomy.add(LensSpan), Taxonomy.add(LifecycleSpan))

const lensStimulus = Stimulus.make({
  name: 'lens.build',
  run: ({ input }: { readonly input: undefined }) =>
    Effect.flatMap(Lens, (lens) => Span.start(LensSpan, { 'lens.build': lens.build })(Effect.succeed(input))),
})

const lifecycleStimulus = Stimulus.make({
  name: 'lifecycle.build',
  run: ({ input }: { readonly input: undefined }) =>
    Effect.flatMap(
      Lifecycle,
      (lifecycle) =>
        Effect.flatMap(lifecycle.next, (build) =>
          Span.start(LifecycleSpan, { 'lifecycle.build': build })(Effect.succeed(input))),
    ),
})

const lensContract = (build: number) =>
  Contract.of(ProbeTaxonomy).stimulate(lensStimulus).holds(Rel.attrs(LensSpan, { 'lens.build': build }))

const lifecycleContract = (build: number) =>
  Contract.of(ProbeTaxonomy)
    .stimulate(lifecycleStimulus)
    .holds(Rel.attrs(LifecycleSpan, { 'lifecycle.build': build }))

TraceSuite('suite layers')
  .withLayer(Layer.merge(sharedLayer, harness))
  .withScenarioLayer(Layer.merge(scenarioLayer, harness))
  .body(({ Case }) => {
    Case('each case rebuilds the scenario layer over a fresh shared lifecycle', lensContract(1), undefined)
    Case('the next case rebuilds both layers again, so it still sees the first build', lensContract(1), undefined)
  })

TraceSuite('suite shared layer alone')
  .withLayer(Layer.merge(sharedLayer, harness))
  .body(({ Case }) => {
    Case(
      'the suite-wide layer carries the harness for a body without a scenario layer',
      lifecycleContract(1),
      undefined,
    )
  })

const sharedProbeRuntime = harness.pipe(
  Layer.provideMerge(sharedLayer),
  Layer.provide(harness),
)

const lensProbeRuntime = Layer.merge(scenarioLayer, harness).pipe(
  Layer.provideMerge(sharedLayer),
  Layer.provide(harness),
)

it.fails('Should_FailTheCheck_When_TheLifecycleBuildWasNeverProduced', function*({ expect }) {
  yield* Contract.check(lensContract(99), expect, undefined).pipe(Effect.provide(lensProbeRuntime))
})

it('Should_HoldTheCheck_When_TheNextLifecycleBuildIsProduced', function*({ expect }) {
  yield* Contract.check(lifecycleContract(1), expect, undefined).pipe(Effect.provide(sharedProbeRuntime))
})
