import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { cloudflareErrorKind, CloudflareErrorSignal } from './errors.schema.js'

const EntitlementVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/alchemy-cloudflare/EntitlementVerdict',
)
type EntitlementVerdictTypeId = typeof EntitlementVerdictTypeId

export class Entitled extends Schema.TaggedClass<Entitled>()('Entitled', {}) {
  readonly [EntitlementVerdictTypeId] = EntitlementVerdictTypeId
}

export class AccessPending extends Schema.TaggedClass<AccessPending>()('AccessPending', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [EntitlementVerdictTypeId] = EntitlementVerdictTypeId
}

export const EntitlementVerdict = Schema.Union([Entitled, AccessPending])

export type EntitlementVerdict = typeof EntitlementVerdict.Type

const decideEntitlement = (command: CloudflareErrorSignal) =>
  Match.value(cloudflareErrorKind(command)).pipe(
    Match.when(
      'Entitlement',
      () => Result.succeed(AccessPending.make({ code: command.code, message: command.message })),
    ),
    Match.when('NotFound', () => Result.succeed(Entitled.make({}))),
    Match.when('AlreadyExists', () => Result.succeed(Entitled.make({}))),
    Match.when('Validation', () => Result.succeed(Entitled.make({}))),
    Match.when('RateLimited', () => Result.succeed(Entitled.make({}))),
    Match.when('Unknown', () => Result.succeed(Entitled.make({}))),
    Match.exhaustive,
  )

export const judgeEntitlement = Workflow.make({
  command: CloudflareErrorSignal,
  decision: EntitlementVerdict,
  error: Schema.Never,
  decide: decideEntitlement,
})
