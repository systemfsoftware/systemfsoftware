import { Schema } from 'effect'

export class ContractDecodeError extends Schema.TaggedError<ContractDecodeError>()('ContractDecodeError', {
  declarationId: Schema.String,
  spanName: Schema.String,
  spanId: Schema.String,
  attribute: Schema.String,
  detail: Schema.String,
}) {}
