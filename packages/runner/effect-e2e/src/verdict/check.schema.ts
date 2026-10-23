import * as Schema from 'effect/Schema'

import { Locator } from '../engine/locator.schema.js'
import { ScreenshotRef } from '../engine/observation.schema.js'
import { NormalizedRoute, Route } from '../engine/route.schema.js'
import { NodeBounds, NodeRef } from '../engine/semantic-node.schema.js'

export const EvidenceRef = Schema.Union([
  Schema.TaggedStruct('NodeEvidence', { ref: NodeRef }),
  Schema.TaggedStruct('ScreenshotEvidence', { screenshot: ScreenshotRef }),
  Schema.TaggedStruct('RouteEvidence', { route: Route }),
  Schema.TaggedStruct('LogEvidence', { text: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type EvidenceRef = typeof EvidenceRef.Type

export const ModelRef = Schema.Struct({ provider: Schema.String, model: Schema.String })
export type ModelRef = typeof ModelRef.Type

export const TextMatch = Schema.Struct({ kind: Schema.Literals(['exact', 'contains']), value: Schema.String })
export type TextMatch = typeof TextMatch.Type

export const CheckState = Schema.Literals(['checked', 'disabled', 'selected', 'expanded', 'pressed'])
export type CheckState = typeof CheckState.Type

export const VisionMode = Schema.Literals([false, true, 'only'])
export type VisionMode = typeof VisionMode.Type

export const RegionTolerance = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0, { message: 'a region tolerance is a fraction between 0 and 1' }),
  Schema.isLessThanOrEqualTo(1, { message: 'a region tolerance is a fraction between 0 and 1' }),
)

const Present = Schema.TaggedStruct('Present', { locator: Locator })
export type PresentCheck = typeof Present.Type

const Text = Schema.TaggedStruct('Text', { locator: Locator, match: TextMatch })
export type TextCheck = typeof Text.Type

const Value = Schema.TaggedStruct('Value', { locator: Locator, match: TextMatch })
export type ValueCheck = typeof Value.Type

const State = Schema.TaggedStruct('State', { locator: Locator, state: CheckState, expected: Schema.Boolean })
export type StateCheck = typeof State.Type

const RouteCheck = Schema.TaggedStruct('Route', { route: NormalizedRoute })
export type RouteCheck = typeof RouteCheck.Type

const Region = Schema.TaggedStruct('Region', {
  rect: NodeBounds,
  tolerance: RegionTolerance,
  referenceDigest: Schema.optionalKey(Schema.String),
})
export type RegionCheck = typeof Region.Type

type TagOf<Tag extends string> = Schema.TaggedStruct<Tag, Record<never, never>>['Type']

type AllOfTag = TagOf<'AllOf'>
export interface AllOfCheck extends AllOfTag {
  readonly checks: ReadonlyArray<Check>
}

type AnyOfTag = TagOf<'AnyOf'>
export interface AnyOfCheck extends AnyOfTag {
  readonly checks: ReadonlyArray<Check>
}

type NotTag = TagOf<'Not'>
export interface NotCheck extends NotTag {
  readonly check: Check
}

export type Check =
  | PresentCheck
  | TextCheck
  | ValueCheck
  | StateCheck
  | RouteCheck
  | RegionCheck
  | AllOfCheck
  | AnyOfCheck
  | NotCheck

const AllOf = Schema.TaggedStruct('AllOf', {
  checks: Schema.Array(Schema.suspend((): Schema.Codec<Check> => Check)),
})

const AnyOf = Schema.TaggedStruct('AnyOf', {
  checks: Schema.Array(Schema.suspend((): Schema.Codec<Check> => Check)),
})

const Not = Schema.TaggedStruct('Not', { check: Schema.suspend((): Schema.Codec<Check> => Check) })

export const Check: Schema.Codec<Check> = Schema.suspend((): Schema.Codec<Check> =>
  Schema.Union([Present, Text, Value, State, RouteCheck, Region, AllOf, AnyOf, Not])
).annotate({
  identifier: 'Check',
  recursionBudget: { maxDepth: 8, depthSize: 'small' },
})

export const CheckRecord = Schema.Struct({
  sentence: Schema.String,
  check: Check,
  evidence: Schema.Array(EvidenceRef),
  vision: VisionMode,
  resolvedBy: Schema.optionalKey(ModelRef),
  resolvedAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
})
export type CheckRecord = typeof CheckRecord.Type
