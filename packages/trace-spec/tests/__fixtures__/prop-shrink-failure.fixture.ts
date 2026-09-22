import { it, layer } from '@effect/vitest'
import { Contract, Observe, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Layer, Schema } from 'effect'
import { probeInputs } from './probe-arbitrary.js'

const THRESHOLD = 10

const TraceSuite = Suite.make({ it, layer })

const Probe = Span.declare({
  id: 'probe.shrink',
  name: 'probe.shrink',
  attrs: Schema.Struct({ 'probe.value': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make({ id: 'probe-shrink', spans: [Probe], edges: [], forbid: [] })

const discardingFileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString: () => Effect.void }),
)

const duplicateAtOrAboveThreshold = Stimulus.make({
  name: 'probe.shrink',
  run: ({ input }: { readonly input: number }) =>
    Effect.gen(function*() {
      yield* Probe.start({ 'probe.value': input })(Effect.void)
      return yield* (input >= THRESHOLD ? Probe.start({ 'probe.value': input })(Effect.void) : Effect.void)
    }),
})

const atMostOneProbe = Contract.of(ProbeTaxonomy)
  .stimulate(duplicateAtOrAboveThreshold)
  .holds(Rel.unique(Probe))

// Deliberately failing: inputs at or above the threshold emit a second probe span, so
// uniqueness breaks and the generated case shrinks the counterexample to the threshold.
TraceSuite('prop shrink failure fixture')
  .withScenarioLayer(Layer.merge(Observe.inMemory, discardingFileSystem))
  .body(({ Case }) => {
    Case.prop('a generated input at or above the threshold duplicates the probe', atMostOneProbe, probeInputs)
  })
