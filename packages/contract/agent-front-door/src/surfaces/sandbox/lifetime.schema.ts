import { Contract, Sandbox } from '@systemfsoftware/effect-contract'
import { Schema } from 'effect'

const Completed = Schema.TaggedStruct('Completed', { value: Schema.Json })
const EgressDenied = Schema.TaggedStruct('EgressDenied', { host: Schema.String })
const TimedOut = Schema.TaggedStruct('TimedOut', {})
const Threw = Schema.TaggedStruct('Threw', { message: Schema.String })
const Refused = Schema.TaggedStruct('Refused', { refusal: Schema.Json })

export const ProgramOutcome = Schema.Union([Completed, EgressDenied, TimedOut, Threw, Refused])
export type ProgramOutcome = typeof ProgramOutcome.Type

export const ToolCall = Schema.Struct({ capability: Schema.String, input: Schema.Json })
export type ToolCall = typeof ToolCall.Type

export const FacetPrepare = Schema.Struct({
  programId: Sandbox.ProgramId,
  classCode: Schema.String,
  ttlSeconds: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type FacetPrepare = typeof FacetPrepare.Type

export const PrincipalEncoded = Schema.toCodecJson(Contract.Principal)
export type PrincipalEncoded = typeof PrincipalEncoded.Type

export class SandboxHostFailed extends Schema.TaggedError<SandboxHostFailed>()('SandboxHostFailed', {
  message: Schema.String,
}) {}
