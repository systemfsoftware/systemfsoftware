import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { GraphNode } from './graph.schema.js'
import type { Relation } from './Rel.js'

export class TraceGraphCommand extends Schema.Class<TraceGraphCommand>('TraceGraphCommand')({
  traceId: Schema.String,
  nodes: Schema.Array(GraphNode),
}) {
  static readonly [Workflow.InstrumentationBrand] = { traceId: 'trace_spec.trace.id' } as const
}

/**
 * The pure decision of a trace contract: the decoded graph arrives as the command's plain
 * data, the contract's relation is judged against it, and the verdict — hold, or break —
 * is the outcome the encode and write phases render and persist.
 */
export const holdTraceContract = (relation: Relation) =>
  Workflow.total(TraceGraphCommand, (command) => Result.succeed(relation(command)))
