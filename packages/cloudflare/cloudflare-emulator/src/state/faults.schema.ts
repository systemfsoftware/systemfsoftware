import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const FaultOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/FaultVerdict')
type FaultOutcomeTypeId = typeof FaultOutcomeTypeId

export class InjectedStatusFault extends Schema.TaggedClass<InjectedStatusFault>()('InjectedStatusFault', {
  operation: Schema.String,
  status: Schema.Finite,
  retryAfterSeconds: Schema.Finite,
  remaining: Schema.Finite,
}) {}

export class CommitThenResetFault extends Schema.TaggedClass<CommitThenResetFault>()('CommitThenResetFault', {
  operation: Schema.String,
  remaining: Schema.Finite,
}) {}

export class VisibilityWindowFault extends Schema.TaggedClass<VisibilityWindowFault>()('VisibilityWindowFault', {
  operation: Schema.String,
  remainingReads: Schema.Finite,
}) {}

export const OperationFault = Schema.Union([InjectedStatusFault, CommitThenResetFault, VisibilityWindowFault])
export type OperationFault = typeof OperationFault.Type

export class FaultProceed extends Schema.TaggedClass<FaultProceed>()('FaultProceed', {
  faults: Schema.Array(OperationFault),
}) {
  readonly [FaultOutcomeTypeId] = FaultOutcomeTypeId
}

export class FaultInject extends Schema.TaggedClass<FaultInject>()('FaultInject', {
  faults: Schema.Array(OperationFault),
  status: Schema.Finite,
  retryAfterSeconds: Schema.Finite,
}) {
  readonly [FaultOutcomeTypeId] = FaultOutcomeTypeId
}

export class FaultReset extends Schema.TaggedClass<FaultReset>()('FaultReset', {
  faults: Schema.Array(OperationFault),
}) {
  readonly [FaultOutcomeTypeId] = FaultOutcomeTypeId
}

export class FaultHidden extends Schema.TaggedClass<FaultHidden>()('FaultHidden', {
  faults: Schema.Array(OperationFault),
}) {
  readonly [FaultOutcomeTypeId] = FaultOutcomeTypeId
}

export const FaultVerdict = Schema.Union([FaultProceed, FaultInject, FaultReset, FaultHidden])
export type FaultVerdict = typeof FaultVerdict.Type

export class FaultCommand extends Schema.TaggedClass<FaultCommand>()('FaultCommand', {
  operation: Schema.String,
  isWrite: Schema.Boolean,
  faults: Schema.Array(OperationFault),
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
