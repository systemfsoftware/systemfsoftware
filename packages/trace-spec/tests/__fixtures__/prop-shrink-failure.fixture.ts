import { NodeFileSystem } from '@effect/platform-node'
import { it, layer } from '@effect/vitest'
import { Contract, InMemory, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, Layer, Schema } from 'effect'
import { probeInputs } from './probe-arbitrary.js'

const THRESHOLD = 10

const TraceSuite = Suite.make({ it, layer })

const Probe = Span.declare({
  id: 'probe.shrink',
  name: 'probe.shrink',
  attrs: Schema.Struct({ 'probe.value': Schema.Finite }),
})

const ProbeTaxonomy = Taxonomy.make('probe-shrink').pipe(Taxonomy.add(Probe))

const duplicateAtOrAboveThreshold = Stimulus.make({
  name: 'probe.shrink',
  run: ({ input }: { readonly input: number }) =>
    Effect.gen(function*() {
      yield* Span.start(Probe, { 'probe.value': input })(Effect.void)
      return yield* (input >= THRESHOLD ? Span.start(Probe, { 'probe.value': input })(Effect.void) : Effect.void)
    }),
})

const atMostOneProbe = Contract.of(ProbeTaxonomy)
  .stimulate(duplicateAtOrAboveThreshold)
  .holds(Rel.unique(Probe))

// Deliberately failing: inputs at or above the threshold emit a second probe span, so
// uniqueness breaks and the generated case shrinks the counterexample to the threshold.
// The real file system backs the failure dump, so exactly one dump lands on disk for
// the one shrunk input that is re-checked.
TraceSuite('prop shrink failure fixture')
  .withScenarioLayer(Layer.merge(InMemory.layer(), NodeFileSystem.layer))
  .body(({ Case }) => {
    Case.prop('a generated input at or above the threshold duplicates the probe', atMostOneProbe, probeInputs)
  })
