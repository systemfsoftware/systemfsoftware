import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const TelemetryOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/TelemetryOutcome')
type TelemetryOutcomeTypeId = typeof TelemetryOutcomeTypeId

export type TelemetryFilterNode =
  | {
    readonly filterCombination: 'and' | 'or' | 'AND' | 'OR'
    readonly filters: ReadonlyArray<TelemetryFilterNode>
    readonly kind: 'group'
  }
  | {
    readonly key: string
    readonly kind?: 'filter' | undefined
    readonly operation?: string | undefined
    readonly type?: string | undefined
    readonly value?: string | number | boolean | undefined
  }

export const TelemetryFilterValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
export type TelemetryFilterValue = typeof TelemetryFilterValue.Type

export const TelemetryFilterNode = Schema.suspend((): Schema.Codec<TelemetryFilterNode> => __TelemetryFilterNode)

const TelemetryFilterLeaf = Schema.Struct({
  key: Schema.String,
  kind: Schema.optional(Schema.Literal('filter')),
  operation: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  value: Schema.optional(TelemetryFilterValue),
})

const TelemetryFilterGroup = Schema.Struct({
  filterCombination: Schema.Literals(['and', 'or', 'AND', 'OR']),
  filters: Schema.Array(TelemetryFilterNode),
  kind: Schema.Literal('group'),
})

const __TelemetryFilterNode: Schema.Codec<TelemetryFilterNode> = Schema.Union([TelemetryFilterGroup, TelemetryFilterLeaf])

export const TelemetryParameters = Schema.StructWithRest(
  Schema.Struct({ filters: Schema.optional(Schema.Array(TelemetryFilterNode)) }),
  [Schema.Record(Schema.String, Schema.Json)],
)
export type TelemetryParameters = typeof TelemetryParameters.Type

export const TelemetryQueryInput = Schema.Struct({
  dry: Schema.optional(Schema.Boolean),
  granularity: Schema.optional(Schema.Finite),
  parameters: Schema.optional(TelemetryParameters),
  queryId: Schema.String,
  timeframe: Schema.Struct({ from: Schema.Finite, to: Schema.Finite }),
  view: Schema.optional(Schema.Literals(['traces', 'events', 'calculations', 'invocations', 'requests', 'agents'])),
})
export type TelemetryQueryInput = typeof TelemetryQueryInput.Type

export const TelemetryTrace = Schema.Struct({
  account_id: Schema.String,
  events: Schema.Array(Schema.Json),
  rayId: Schema.String,
  traceId: Schema.String,
})
export type TelemetryTrace = typeof TelemetryTrace.Type

export const TelemetryState = Schema.Array(TelemetryTrace)
export type TelemetryState = typeof TelemetryState.Type

export const emptyTelemetryState: TelemetryState = []

export class TelemetryApplied extends Schema.TaggedClass<TelemetryApplied>()('TelemetryApplied', {
  body: Schema.Json,
  state: TelemetryState,
  status: Schema.Finite,
}) {
  readonly [TelemetryOutcomeTypeId] = TelemetryOutcomeTypeId
}

export class TelemetryRefused extends Schema.TaggedClass<TelemetryRefused>()('TelemetryRefused', {
  body: Schema.Json,
  state: TelemetryState,
  status: Schema.Finite,
}) {
  readonly [TelemetryOutcomeTypeId] = TelemetryOutcomeTypeId
}

export const TelemetryOutcome = Schema.Union([TelemetryApplied, TelemetryRefused])
export type TelemetryOutcome = typeof TelemetryOutcome.Type

export class TelemetryCommand extends Schema.TaggedClass<TelemetryCommand>()('TelemetryCommand', {
  account_id: Schema.String,
  newId: Schema.String,
  now: Schema.String,
  query: TelemetryQueryInput,
  state: TelemetryState,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
