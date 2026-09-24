import { NodeFileSystem } from '@effect/platform-node'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { it } from '@systemfsoftware/vitest'
import { Effect, Layer, Schema } from 'effect'
import { probeInputs } from './probe-arbitrary.schema.js'

const TraceSuite = Suite.make({ it })

const Probe = Span.declare({
  id: 'probe.shrink',
  name: 'probe.shrink',
  attrs: Schema.Struct({ 'probe.value': Schema.Finite }),
})
const DrawSpan = Span.declare({
  id: 'probe.draw',
  name: 'probe.draw',
  attrs: Schema.Struct({ 'probe.draw': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make('probe-shrink').pipe(Taxonomy.add(Probe), Taxonomy.add(DrawSpan))

const oneProbePerDraw = Stimulus.make({
  name: 'probe.shrink',
  run: ({ input }: { readonly input: ReadonlyArray<number> }) =>
    Effect.gen(function*() {
      yield* Span.start(DrawSpan, { 'probe.draw': input.length })(Effect.void)
      yield* Effect.forEach(input, (value) => Span.start(Probe, { 'probe.value': value })(Effect.void), {
        discard: true,
      })
    }),
})

const atMostOneProbe = Contract.of(ProbeTaxonomy)
  .stimulate(oneProbePerDraw)
  .holds(Rel.any(Rel.absent(Probe), Rel.unique(Probe)))

TraceSuite('prop shrink failure fixture')
  .withScenarioLayer(Layer.merge(ObservationWindow.make('trace-spec').layer, NodeFileSystem.layer))
  .body(({ Case }) => {
    Case.prop('a generated draw with several probes breaks uniqueness', atMostOneProbe, probeInputs)
  })
