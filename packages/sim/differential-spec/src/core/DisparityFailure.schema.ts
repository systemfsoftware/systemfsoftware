import { Schema } from 'effect'

export class DisparityFailure
  extends Schema.TaggedError<DisparityFailure, { readonly brand: unique symbol }>()('DisparityFailure', {
    report: Schema.String,
  })
{
  override get message(): string {
    return this.report
  }
}
