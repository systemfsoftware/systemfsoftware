import { Schema } from 'effect'

export class ContractDecodeError
  extends Schema.TaggedError<ContractDecodeError, { readonly brand: unique symbol }>()('ContractDecodeError', {
    declarationId: Schema.String,
    spanName: Schema.String,
    spanId: Schema.String,
    attribute: Schema.String,
    detail: Schema.String,
  })
{
  override get message(): string {
    return `Span "${this.spanName}" (${this.spanId}) does not satisfy contract "${this.declarationId}": ${this.detail}`
  }
}
