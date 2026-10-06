import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const TracingOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/TracingOutcome')
type TracingOutcomeTypeId = typeof TracingOutcomeTypeId

export const PropagationPolicy = Schema.Literals(['accept', 'authenticated', 'reject'])
export type PropagationPolicy = typeof PropagationPolicy.Type

export const SamplingRatio = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1))
export type SamplingRatio = typeof SamplingRatio.Type

export const TracingSettings = Schema.Struct({
  destinations: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
  forward_context: Schema.Boolean,
  persist: Schema.Boolean,
  propagation_policy: PropagationPolicy,
  sampling_ratio: SamplingRatio,
})
export type TracingSettings = typeof TracingSettings.Type

export const TracingSettingsPatch = Schema.Struct({
  destinations: Schema.optional(Schema.Array(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
  forward_context: Schema.optional(Schema.Boolean),
  persist: Schema.optional(Schema.Boolean),
  propagation_policy: Schema.optional(PropagationPolicy),
  sampling_ratio: Schema.optional(SamplingRatio),
})
export type TracingSettingsPatch = typeof TracingSettingsPatch.Type

export const TracingRule = Schema.Struct({
  action: Schema.Literal('set_trace_settings'),
  action_parameters: Schema.Struct({ sampling_ratio: SamplingRatio }),
  description: Schema.String,
  enabled: Schema.Boolean,
  expression: Schema.String.check(Schema.isMinCodePoints(1)).check(Schema.isMaxCodePoints(4096)),
})
export type TracingRule = typeof TracingRule.Type

export const TracingZone = Schema.Struct({
  baseline: TracingSettings,
  rules: Schema.Array(TracingRule),
  settings: TracingSettings,
  zone_id: Schema.String,
})
export type TracingZone = typeof TracingZone.Type

export const ZoneTracingState = Schema.Array(TracingZone)
export type ZoneTracingState = typeof ZoneTracingState.Type

export const emptyZoneTracingState: ZoneTracingState = []

export const defaultTracingSettings: TracingSettings = {
  destinations: [],
  enabled: false,
  forward_context: false,
  persist: true,
  propagation_policy: 'reject',
  sampling_ratio: 1,
}

export class GetTracingSettings extends Schema.TaggedClass<GetTracingSettings>()('GetTracingSettings', {
  zone_id: Schema.String,
}) {}

export class PatchTracingSettings extends Schema.TaggedClass<PatchTracingSettings>()('PatchTracingSettings', {
  patch: TracingSettingsPatch,
  zone_id: Schema.String,
}) {}

export class ResetTracingSettings extends Schema.TaggedClass<ResetTracingSettings>()('ResetTracingSettings', {
  zone_id: Schema.String,
}) {}

export class GetTracingRules extends Schema.TaggedClass<GetTracingRules>()('GetTracingRules', {
  zone_id: Schema.String,
}) {}

export class ReplaceTracingRules extends Schema.TaggedClass<ReplaceTracingRules>()('ReplaceTracingRules', {
  rules: Schema.Array(TracingRule),
  zone_id: Schema.String,
}) {}

export class DeleteTracingRules extends Schema.TaggedClass<DeleteTracingRules>()('DeleteTracingRules', {
  zone_id: Schema.String,
}) {}

export const TracingRequest = Schema.Union([
  GetTracingSettings,
  PatchTracingSettings,
  ResetTracingSettings,
  GetTracingRules,
  ReplaceTracingRules,
  DeleteTracingRules,
])
export type TracingRequest = typeof TracingRequest.Type

export class TracingApplied extends Schema.TaggedClass<TracingApplied>()('TracingApplied', {
  body: Schema.Json,
  state: ZoneTracingState,
  status: Schema.Finite,
}) {
  readonly [TracingOutcomeTypeId] = TracingOutcomeTypeId
}

export class TracingRefused extends Schema.TaggedClass<TracingRefused>()('TracingRefused', {
  body: Schema.Json,
  state: ZoneTracingState,
  status: Schema.Finite,
}) {
  readonly [TracingOutcomeTypeId] = TracingOutcomeTypeId
}

export const TracingOutcome = Schema.Union([TracingApplied, TracingRefused])
export type TracingOutcome = typeof TracingOutcome.Type

export class TracingCommand extends Schema.TaggedClass<TracingCommand>()('TracingCommand', {
  now: Schema.String,
  request: TracingRequest,
  state: ZoneTracingState,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
