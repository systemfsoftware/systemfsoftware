import { Schema } from 'effect'

export class ChildCrash extends Schema.TaggedError<ChildCrash>()('ChildCrash', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}
