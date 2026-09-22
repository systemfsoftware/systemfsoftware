import type { Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Match } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import * as FailureDump from './FailureDump.js'
import * as Graph from './Graph.js'
import { Observation } from './Observation.service.js'
import type * as Rel from './Rel.js'
import type { Run, Stimulus } from './Stimulus.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'

export { ContractDecodeError, EmptyObservationError, TraceDisparityError }

export const TypeId = Symbol.for('@systemfsoftware/trace-spec/Contract')
export type TypeId = typeof TypeId

export interface Declared extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulate: <Input, Output, E, R>(
    stimulus: Stimulus<Input, Output, E, R>,
  ) => Stimulated<Input, Output, E, R>
}

export interface Stimulated<Input, Output, E, R> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulus: Stimulus<Input, Output, E, R>
  readonly holds: (relation: Rel.Relation) => Contract<Input, Output, E, R>
}

export interface Contract<Input, Output, E, R> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulus: Stimulus<Input, Output, E, R>
  readonly relation: Rel.Relation
}

const stimulatedOf = <Input, Output, E, R>(
  taxonomy: Taxonomy.Taxonomy,
  stimulus: Stimulus<Input, Output, E, R>,
): Stimulated<Input, Output, E, R> => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulus,
  holds: (relation) => contractOf(taxonomy, stimulus, relation),
  ...Prototype,
})

const contractOf = <Input, Output, E, R>(
  taxonomy: Taxonomy.Taxonomy,
  stimulus: Stimulus<Input, Output, E, R>,
  relation: Rel.Relation,
): Contract<Input, Output, E, R> => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulus,
  relation,
  ...Prototype,
})

export const of = (taxonomy: Taxonomy.Taxonomy): Declared => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulate: (stimulus) => stimulatedOf(taxonomy, stimulus),
  ...Prototype,
})

const stimulateDual = <Input, Output, E, R>(
  self: Declared,
  stimulus: Stimulus<Input, Output, E, R>,
): Stimulated<Input, Output, E, R> => stimulatedOf(self.taxonomy, stimulus)

export const stimulate: {
  <Input, Output, E, R>(
    stimulus: Stimulus<Input, Output, E, R>,
  ): (self: Declared) => Stimulated<Input, Output, E, R>
  <Input, Output, E, R>(self: Declared, stimulus: Stimulus<Input, Output, E, R>): Stimulated<Input, Output, E, R>
} = dual(2, stimulateDual)

const holdsDual = <Input, Output, E, R>(
  self: Stimulated<Input, Output, E, R>,
  relation: Rel.Relation,
): Contract<Input, Output, E, R> => contractOf(self.taxonomy, self.stimulus, relation)

export const holds: {
  (
    relation: Rel.Relation,
  ): <Input, Output, E, R>(self: Stimulated<Input, Output, E, R>) => Contract<Input, Output, E, R>
  <Input, Output, E, R>(self: Stimulated<Input, Output, E, R>, relation: Rel.Relation): Contract<Input, Output, E, R>
} = dual(2, holdsDual)

export interface Traced<Input, Output> {
  readonly run: Run<Input, Output>
  readonly graph: Graph.TraceGraph
  readonly verdict: Rel.Verdict
}

const traceDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  input: Input,
): Effect.Effect<
  Traced<Input, Output>,
  E | ContractDecodeError | EmptyObservationError,
  R | Observation
> =>
  Effect.gen(function*() {
    const observation = yield* Observation
    const run = yield* self.stimulus(input)
    const spans = yield* observation.collect(run.traceId)
    const graph = yield* Graph.decode(run.traceId, spans, self.taxonomy)
    return { run, graph, verdict: self.relation(graph) }
  })

export const trace: {
  <Input>(
    input: Input,
  ): <Output, E, R>(
    self: Contract<Input, Output, E, R>,
  ) => Effect.Effect<
    Traced<Input, Output>,
    E | ContractDecodeError | EmptyObservationError,
    R | Observation
  >
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    input: Input,
  ): Effect.Effect<
    Traced<Input, Output>,
    E | ContractDecodeError | EmptyObservationError,
    R | Observation
  >
} = dual(2, traceDual)

const refusalFrom = <Input, Output>(
  relation: Rel.Relation,
  traced: Traced<Input, Output>,
): Effect.Effect<Traced<Input, Output>, TraceDisparityError, FileSystem.FileSystem> =>
  Match.value(traced.verdict).pipe(
    Match.tag('Break', (breach) =>
      Effect.flatMap(
        FailureDump.disparity({ graph: traced.graph, relation, break: breach }),
        Effect.fail,
      )),
    Match.tag('Hold', () => Effect.succeed(traced)),
    Match.exhaustive,
  )

const checkDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  input: Input,
): Effect.Effect<
  Traced<Input, Output>,
  E | ContractDecodeError | EmptyObservationError | TraceDisparityError,
  R | Observation | FileSystem.FileSystem
> => Effect.flatMap(traceDual(self, input), (traced) => refusalFrom(self.relation, traced))

export const check: {
  <Input>(
    input: Input,
  ): <Output, E, R>(
    self: Contract<Input, Output, E, R>,
  ) => Effect.Effect<
    Traced<Input, Output>,
    E | ContractDecodeError | EmptyObservationError | TraceDisparityError,
    R | Observation | FileSystem.FileSystem
  >
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    input: Input,
  ): Effect.Effect<
    Traced<Input, Output>,
    E | ContractDecodeError | EmptyObservationError | TraceDisparityError,
    R | Observation | FileSystem.FileSystem
  >
} = dual(2, checkDual)
