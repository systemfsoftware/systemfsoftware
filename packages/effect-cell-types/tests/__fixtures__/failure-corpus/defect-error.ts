import { Schema } from 'effect'

export class CorpusDefect
  extends Schema.TaggedError<CorpusDefect, { readonly brand: unique symbol }>()('CorpusDefect', {
    defectFile: Schema.String,
    detail: Schema.String,
  })
{
  override get message(): string {
    return this.detail
  }
}

export class MessagelessDefect
  extends Schema.TaggedError<MessagelessDefect, { readonly brand: unique symbol }>()('MessagelessDefect', {
    defectFile: Schema.String,
    hostPort: Schema.Int,
  })
{}
