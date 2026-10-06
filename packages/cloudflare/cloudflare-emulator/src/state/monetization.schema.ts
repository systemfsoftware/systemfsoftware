import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const MonetizationOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/MonetizationOutcome')
type MonetizationOutcomeTypeId = typeof MonetizationOutcomeTypeId

export const EligibilityStatus = Schema.Literals(['pending', 'approved', 'rejected'])
export type EligibilityStatus = typeof EligibilityStatus.Type

export const MonetizationScheme = Schema.Literals(['exact', 'upto', 'origin_controlled'])
export type MonetizationScheme = typeof MonetizationScheme.Type

export const AccountEligibility = Schema.Struct({
  account_id: Schema.String,
  status: EligibilityStatus,
  reasons: Schema.optional(Schema.Array(Schema.String)),
})
export type AccountEligibility = typeof AccountEligibility.Type

export const ZoneEligibility = Schema.Struct({
  zone_id: Schema.String,
  status: EligibilityStatus,
  reasons: Schema.optional(Schema.Array(Schema.String)),
  enabled: Schema.Boolean,
})
export type ZoneEligibility = typeof ZoneEligibility.Type

export const MonetizationRule = Schema.Struct({
  id: Schema.String,
  address: Schema.String,
  description: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  expression: Schema.String,
  scheme: MonetizationScheme,
  price: Schema.optional(Schema.String),
})
export type MonetizationRule = typeof MonetizationRule.Type

export const MonetizationRuleset = Schema.Struct({
  zone_id: Schema.String,
  rules: Schema.Array(MonetizationRule),
})
export type MonetizationRuleset = typeof MonetizationRuleset.Type

export const MonetizationState = Schema.Struct({
  accountEligibility: Schema.Array(AccountEligibility),
  zoneEligibility: Schema.Array(ZoneEligibility),
  rulesets: Schema.Array(MonetizationRuleset),
})
export type MonetizationState = typeof MonetizationState.Type

export const emptyMonetizationState: MonetizationState = {
  accountEligibility: [],
  rulesets: [],
  zoneEligibility: [],
}

export class GetAccountEligibility extends Schema.TaggedClass<GetAccountEligibility>()('GetAccountEligibility', {
  account_id: Schema.String,
}) {}

export class CheckAccountEligibility extends Schema.TaggedClass<CheckAccountEligibility>()('CheckAccountEligibility', {
  account_id: Schema.String,
}) {}

export class GetZoneEligibility extends Schema.TaggedClass<GetZoneEligibility>()('GetZoneEligibility', {
  zone_id: Schema.String,
}) {}

export class CheckZoneEligibility extends Schema.TaggedClass<CheckZoneEligibility>()('CheckZoneEligibility', {
  zone_id: Schema.String,
}) {}

export class ListRules extends Schema.TaggedClass<ListRules>()('ListRules', {
  zone_id: Schema.String,
}) {}

export const RulesetRule = Schema.Struct({
  address: Schema.String,
  description: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  expression: Schema.String,
  id: Schema.optional(Schema.String),
  scheme: MonetizationScheme,
  price: Schema.optional(Schema.String),
})
export type RulesetRule = typeof RulesetRule.Type

export class DeployRuleset extends Schema.TaggedClass<DeployRuleset>()('DeployRuleset', {
  zone_id: Schema.String,
  rules: Schema.Array(RulesetRule),
}) {}

export class DeleteRuleset extends Schema.TaggedClass<DeleteRuleset>()('DeleteRuleset', {
  zone_id: Schema.String,
}) {}

export class GetRule extends Schema.TaggedClass<GetRule>()('GetRule', {
  zone_id: Schema.String,
  rule_id: Schema.String,
}) {}

export class DeleteRule extends Schema.TaggedClass<DeleteRule>()('DeleteRule', {
  zone_id: Schema.String,
  rule_id: Schema.String,
}) {}

export class PatchRule extends Schema.TaggedClass<PatchRule>()('PatchRule', {
  zone_id: Schema.String,
  rule_id: Schema.String,
  address: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  expression: Schema.optional(Schema.String),
  price: Schema.optional(Schema.String),
  scheme: Schema.optional(MonetizationScheme),
}) {}

export const MonetizationRequest = Schema.Union([
  GetAccountEligibility,
  CheckAccountEligibility,
  GetZoneEligibility,
  CheckZoneEligibility,
  ListRules,
  DeployRuleset,
  DeleteRuleset,
  GetRule,
  DeleteRule,
  PatchRule,
])
export type MonetizationRequest = typeof MonetizationRequest.Type

export class MonetizationApplied extends Schema.TaggedClass<MonetizationApplied>()('MonetizationApplied', {
  state: MonetizationState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [MonetizationOutcomeTypeId] = MonetizationOutcomeTypeId
}

export class MonetizationRefused extends Schema.TaggedClass<MonetizationRefused>()('MonetizationRefused', {
  state: MonetizationState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [MonetizationOutcomeTypeId] = MonetizationOutcomeTypeId
}

export const MonetizationOutcome = Schema.Union([MonetizationApplied, MonetizationRefused])
export type MonetizationOutcome = typeof MonetizationOutcome.Type

export class MonetizationCommand extends Schema.TaggedClass<MonetizationCommand>()('MonetizationCommand', {
  now: Schema.String,
  newId: Schema.String,
  state: MonetizationState,
  request: MonetizationRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
