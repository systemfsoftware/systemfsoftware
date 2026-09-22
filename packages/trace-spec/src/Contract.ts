import type { Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Schema } from 'effect'
import type { ContractDecodeError } from './ContractDecodeError.schema.js'
import type { EmptyObservationError } from './EmptyObservationError.schema.js'
import * as FailureDump from './FailureDump.js'
import * as Graph from './Graph.js'
import { Observation } from './Observe.js'
import type * as Rel from './Rel.js'
import type { Stimulus } from './Stimulus.js'
import type { TraceDisparityError } from './TraceDisparityError.schema.js'
import { Break } from './Verdict.schema.js'

export interface Contract<Input, Output, E, R> {
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulus: Stimulus<Input, Output, E, R>
  readonly relation: Rel.Relation
}

export interface Stimulated<Input, Output, E, R> {
  readonly holds: (relation: Rel.Relation) => Contract<Input, Output, E, R>
}

export interface Declared {
  readonly stimulate: <Input, Output, E, R>(
    stimulus: Stimulus<Input, Output, E, R>,
  ) => Stimulated<Input, Output, E, R>
}

export const of = (taxonomy: Taxonomy.Taxonomy): Declared => ({
  stimulate: (stimulus) => ({ holds: (relation) => ({ taxonomy, stimulus, relation }) }),
})

export interface Checked<Input, Output> {
  readonly run: { readonly input: Input; readonly traceId: string; readonly output: Output }
  readonly graph: Graph.TraceGraph
}

const failOnBreak = <Input, Output>(
  checked: Checked<Input, Output>,
  relation: Rel.Relation,
  verdict: Break,
): Effect.Effect<Checked<Input, Output>, TraceDisparityError, FileSystem.FileSystem> =>
  Effect.flatMap(
    FailureDump.disparity({ graph: checked.graph, relation, break: verdict }),
    (disparity) => Effect.fail(disparity),
  )

export const check = <Input, Output, E, R>(
  contract: Contract<Input, Output, E, R>,
  input: Input,
): Effect.Effect<
  Checked<Input, Output>,
  E | ContractDecodeError | EmptyObservationError | TraceDisparityError,
  R | Observation | FileSystem.FileSystem
> =>
  Effect.gen(function*() {
    const observation = yield* Observation
    const run = yield* contract.stimulus.run(input)
    const spans = yield* observation.collect(run.traceId)
    const graph = yield* Graph.decode(run.traceId, spans, contract.taxonomy)
    const verdict = contract.relation.evaluate(graph)
    const checked: Checked<Input, Output> = { run, graph }
    return Schema.is(Break)(verdict) ? yield* failOnBreak(checked, contract.relation, verdict) : checked
  })
