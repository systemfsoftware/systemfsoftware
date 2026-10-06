import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import { NotificationPolicyState } from './notification-policy.schema.js'

const IssuesAutomationOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/IssuesAutomationOutcome',
)
type IssuesAutomationOutcomeTypeId = typeof IssuesAutomationOutcomeTypeId

export const IssuesAutomationScope = Schema.Literals(['account', 'service'])
export type IssuesAutomationScope = typeof IssuesAutomationScope.Type

export const IssuesAutomationTriggerType = Schema.Literals(['occurrence_threshold', 'recurrence_after_inactivity'])
export type IssuesAutomationTriggerType = typeof IssuesAutomationTriggerType.Type

export const IssuesAutomation = Schema.Struct({
  ansPolicyId: Schema.String,
  created: Schema.Finite,
  createdByUserId: Schema.Union([Schema.String, Schema.Null]),
  enabled: Schema.Boolean,
  id: Schema.String,
  inactivitySeconds: Schema.Union([Schema.Finite, Schema.Null]),
  name: Schema.String,
  revision: Schema.Finite,
  scope: IssuesAutomationScope,
  service: Schema.Union([Schema.String, Schema.Null]),
  serviceType: Schema.Union([Schema.String, Schema.Null]),
  threshold: Schema.Union([Schema.Finite, Schema.Null]),
  triggerType: IssuesAutomationTriggerType,
  updated: Schema.Finite,
  updatedByUserId: Schema.Union([Schema.String, Schema.Null]),
})
export type IssuesAutomation = typeof IssuesAutomation.Type

export const IssuesAutomationState = Schema.Array(IssuesAutomation)
export type IssuesAutomationState = typeof IssuesAutomationState.Type

export const emptyIssuesAutomationState: IssuesAutomationState = []

export class ListIssuesAutomations extends Schema.TaggedClass<ListIssuesAutomations>()('ListIssuesAutomations', {
  service: Schema.optional(Schema.String),
}) {}

export class CreateIssuesAutomation extends Schema.TaggedClass<CreateIssuesAutomation>()('CreateIssuesAutomation', {
  afterInactivitySeconds: Schema.optional(Schema.Finite),
  afterOccurrences: Schema.optional(Schema.Finite),
  enabled: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  policyId: Schema.String,
  service: Schema.optional(Schema.String),
}) {}

export class GetIssuesAutomation extends Schema.TaggedClass<GetIssuesAutomation>()('GetIssuesAutomation', {
  automationId: Schema.String,
}) {}

export class UpdateIssuesAutomation extends Schema.TaggedClass<UpdateIssuesAutomation>()('UpdateIssuesAutomation', {
  automationId: Schema.String,
  afterInactivitySeconds: Schema.optional(Schema.Finite),
  afterOccurrences: Schema.optional(Schema.Finite),
  enabled: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  policyId: Schema.String,
  service: Schema.optional(Schema.String),
}) {}

export class DeleteIssuesAutomation extends Schema.TaggedClass<DeleteIssuesAutomation>()('DeleteIssuesAutomation', {
  automationId: Schema.String,
}) {}

export const IssuesAutomationRequest = Schema.Union([
  ListIssuesAutomations,
  CreateIssuesAutomation,
  GetIssuesAutomation,
  UpdateIssuesAutomation,
  DeleteIssuesAutomation,
])
export type IssuesAutomationRequest = typeof IssuesAutomationRequest.Type

export class IssuesAutomationApplied extends Schema.TaggedClass<IssuesAutomationApplied>()('IssuesAutomationApplied', {
  state: IssuesAutomationState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [IssuesAutomationOutcomeTypeId] = IssuesAutomationOutcomeTypeId
}

export class IssuesAutomationRefused extends Schema.TaggedClass<IssuesAutomationRefused>()('IssuesAutomationRefused', {
  state: IssuesAutomationState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [IssuesAutomationOutcomeTypeId] = IssuesAutomationOutcomeTypeId
}

export const IssuesAutomationOutcome = Schema.Union([IssuesAutomationApplied, IssuesAutomationRefused])
export type IssuesAutomationOutcome = typeof IssuesAutomationOutcome.Type

export class IssuesAutomationCommand extends Schema.TaggedClass<IssuesAutomationCommand>()('IssuesAutomationCommand', {
  nowMillis: Schema.Finite,
  newId: Schema.String,
  automations: IssuesAutomationState,
  policies: NotificationPolicyState,
  request: IssuesAutomationRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
