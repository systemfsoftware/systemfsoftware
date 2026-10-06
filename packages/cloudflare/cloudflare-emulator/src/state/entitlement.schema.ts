import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const EntitlementOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/EntitlementOutcome')
type EntitlementOutcomeTypeId = typeof EntitlementOutcomeTypeId

export const GateProduct = Schema.Literals(['kv-instant', 'basin-catalog', 'issues', 'spectrum', 'monetization'])
export type GateProduct = typeof GateProduct.Type

export const EntitlementSeed = Schema.Struct({
  product: GateProduct,
  entitled: Schema.Boolean,
})
export type EntitlementSeed = typeof EntitlementSeed.Type

export class Entitled extends Schema.TaggedClass<Entitled>()('Entitled', {}) {
  readonly [EntitlementOutcomeTypeId] = EntitlementOutcomeTypeId
}

export class AccessPending extends Schema.TaggedClass<AccessPending>()('AccessPending', {
  code: Schema.Finite,
  message: Schema.String,
}) {
  readonly [EntitlementOutcomeTypeId] = EntitlementOutcomeTypeId
}

export const EntitlementOutcome = Schema.Union([Entitled, AccessPending])
export type EntitlementOutcome = typeof EntitlementOutcome.Type

export class EntitlementCommand extends Schema.TaggedClass<EntitlementCommand>()('EntitlementCommand', {
  product: GateProduct,
  seeds: Schema.Array(EntitlementSeed),
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
