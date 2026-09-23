import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import { it, layer } from '@effect/vitest'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Context, Effect, FileSystem, Layer, Ref, Schema } from 'effect'

const TraceSuite = Suite.make({ it, layer })

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
    Case('the first case sees the first scenario build', lensContract(1), undefined)
    Case('the second case sees the second scenario build on the same shared lifecycle', lensContract(2), undefined)
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

it.effect('Should_Fail_When_UnbuiltLifecycleBuild', () =>
  lensContract(99).pipe(
    Contract.check<undefined>(undefined),
    Effect.flip,
    Effect.flatMap((failure) => Schema.is(Contract.TraceDisparityError)(failure) ? Effect.void : Effect.die(failure)),
    Effect.asVoid,
    Effect.provide(lensProbeRuntime),
  ))

it.effect('Should_Hold_When_NextLifecycleBuild', () =>
  lifecycleContract(1).pipe(
    Contract.check<undefined>(undefined),
    Effect.asVoid,
    Effect.provide(sharedProbeRuntime),
  ))
