import { Schema } from 'effect'

export class CorpusDefect extends Schema.TaggedError<CorpusDefect>()('CorpusDefect', {
  defectFile: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}
