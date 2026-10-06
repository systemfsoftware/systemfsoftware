import { Schema } from 'effect'
import { OperationId } from '../Operations/operation.schema.js'

export const TaggedValue = Schema.Struct({ _tag: Schema.String })
export type TaggedValue = typeof TaggedValue.Type

export const NextAction = Schema.Struct({ operation: Schema.String, input: Schema.JsonObject })
export type NextAction = typeof NextAction.Type

export const Completed = Schema.TaggedStruct('Completed', { output: Schema.Unknown, next: Schema.Array(NextAction) })
export type Completed = typeof Completed.Type

export const Refused = Schema.TaggedStruct('Refused', { refusal: TaggedValue, next: Schema.Array(NextAction) })
export type Refused = typeof Refused.Type

export const Rejected = Schema.TaggedStruct('Rejected', { issue: Schema.String })
export type Rejected = typeof Rejected.Type

export const Accepted = Schema.TaggedStruct('Accepted', { operation: OperationId, next: Schema.Array(NextAction) })
export type Accepted = typeof Accepted.Type

export const Answer = Schema.Union([Completed, Refused, Rejected, Accepted])
export type Answer = typeof Answer.Type
