import { it, layer } from '@effect/vitest'
import { Contract, Observe, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { probeInputs } from './__fixtures__/probe-arbitrary.js'

const TraceSuite = Suite.make({ it, layer })

const harness = Layer.merge(
  Observe.inMemory,
  Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
  ),
)

const Probe = Span.declare({
  id: 'probe.prop',
  name: 'probe.prop',
  attrs: Schema.Struct({ 'probe.value': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make({ id: 'probe-prop', spans: [Probe], edges: [], forbid: [] })

const emitExactlyOne = Stimulus.make({
  name: 'probe.prop',
  run: ({ input }: { readonly input: number }) => Probe.start({ 'probe.value': input })(Effect.void),
})

const uniqueProbe = Contract.of(ProbeTaxonomy).stimulate(emitExactlyOne).holds(Rel.unique(Probe))

TraceSuite('case prop')
  .withScenarioLayer(harness)
  .body(({ Case }) => {
    Case.prop('every generated input emits exactly one probe span', uniqueProbe, probeInputs)
  })
