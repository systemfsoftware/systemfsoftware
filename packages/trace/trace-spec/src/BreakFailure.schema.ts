import { Schema } from 'effect'

export class BreakFailure
  extends Schema.TaggedError<BreakFailure, { readonly brand: unique symbol }>()('BreakFailure', {
    report: Schema.String,
  })
{
  override get message(): string {
    return this.report
  }
}
