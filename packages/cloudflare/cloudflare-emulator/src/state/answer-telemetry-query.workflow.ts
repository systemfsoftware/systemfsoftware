import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import { TelemetryApplied, TelemetryCommand, TelemetryOutcome, TelemetryRefused } from './telemetry.schema.js'
import type { TelemetryFilterNode, TelemetryFilterValue, TelemetryTrace } from './telemetry.schema.js'

const rayIdKeys = ['$metadata.rayId', 'rayId']
const defaultGranularity = 30
const timeframeMessage = 'The timeframe must start before it ends.'

type FilterGroup = Extract<TelemetryFilterNode, { readonly kind: 'group' }>
type FilterLeaf = Extract<TelemetryFilterNode, { readonly key: string }>

const isGroup = (node: TelemetryFilterNode): node is FilterGroup => node.kind === 'group'
const isLeaf = (node: TelemetryFilterNode): node is FilterLeaf => node.kind !== 'group'

const leafNodes = (nodes: ReadonlyArray<TelemetryFilterNode>): ReadonlyArray<FilterLeaf> => Array.filter(nodes, isLeaf)

const groupNodes = (nodes: ReadonlyArray<TelemetryFilterNode>): ReadonlyArray<FilterGroup> =>
  Array.filter(nodes, isGroup)

const descendantLeaves = (nodes: ReadonlyArray<TelemetryFilterNode>): ReadonlyArray<FilterLeaf> =>
  Array.appendAll(
    leafNodes(nodes),
    Array.flatMap(groupNodes(nodes), (group) => descendantLeaves(group.filters)),
  )

const stringValue = (value: TelemetryFilterValue): Option.Option<string> =>
  Option.filter(Option.some(value), (candidate): candidate is string => typeof candidate === 'string')

const rayOf = (leaves: ReadonlyArray<FilterLeaf>): Option.Option<string> =>
  Option.flatMap(
    Array.findFirst(leaves, (leaf) => Array.contains(rayIdKeys, leaf.key)),
    (leaf) => Option.flatMap(Option.fromUndefinedOr(leaf.value), stringValue),
  )

const traceOf = (
  state: ReadonlyArray<TelemetryTrace>,
  account_id: string,
  rayId: string,
): Option.Option<TelemetryTrace> =>
  Array.findFirst(
    state,
    (trace) => Array.every([trace.account_id === account_id, trace.rayId === rayId], (matches) => matches),
  )

const filtersOf = (command: TelemetryCommand): ReadonlyArray<TelemetryFilterNode> =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(command.query.parameters),
      (parameters) => Option.fromUndefinedOr(parameters.filters),
    ),
    () => [],
  )

const timeframeValid = (command: TelemetryCommand): boolean => command.query.timeframe.from < command.query.timeframe.to

const refused = (command: TelemetryCommand): TelemetryRefused =>
  TelemetryRefused.make({
    body: failureEnvelope({ code: 1003, message: timeframeMessage }),
    state: command.state,
    status: 400,
  })

const answered = (command: TelemetryCommand, trace: Option.Option<TelemetryTrace>): TelemetryApplied => {
  const events = Option.getOrElse(Option.map(trace, (found) => found.events), () => [])
  const statistics = { abr_level: 1, bytes_read: 0, elapsed: 0, rows_read: events.length }
  const granularity = Option.getOrElse(
    Option.fromUndefinedOr(command.query.granularity),
    () => defaultGranularity,
  )
  const parameters = Option.getOrElse(Option.fromUndefinedOr(command.query.parameters), () => ({}))
  return TelemetryApplied.make({
    body: successEnvelope({
      events: { count: events.length, events },
      run: {
        accountId: command.account_id,
        created: command.now,
        dry: Option.getOrElse(Option.fromUndefinedOr(command.query.dry), () => false),
        granularity,
        id: command.newId,
        query: {
          adhoc: true,
          created: command.now,
          createdBy: command.account_id,
          description: null,
          id: command.query.queryId,
          name: command.query.queryId,
          parameters,
          updated: command.now,
          updatedBy: command.account_id,
        },
        statistics,
        status: 'COMPLETED',
        timeframe: command.query.timeframe,
        userId: command.account_id,
      },
      statistics,
    }),
    state: command.state,
    status: 200,
  })
}

const runQuery = (command: TelemetryCommand): TelemetryOutcome =>
  answered(
    command,
    Option.flatMap(
      rayOf(descendantLeaves(filtersOf(command))),
      (rayId) => traceOf(command.state, command.account_id, rayId),
    ),
  )

const decide = (command: TelemetryCommand): Result.Result<TelemetryOutcome, never> =>
  Result.succeed(
    Match.value(timeframeValid(command)).pipe(
      Match.when(true, () => runQuery(command)),
      Match.when(false, () => refused(command)),
      Match.exhaustive,
    ),
  )

export const answerTelemetryQuery = Workflow.make({
  command: TelemetryCommand,
  decision: TelemetryOutcome,
  error: Schema.Never,
  decide,
})
