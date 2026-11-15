import { Schema } from 'effect'

const capitalized = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

/**
 * The failing step's fields. `message` is the step's headline alone; the cause's summary is
 * presentation, which `StepError` in `StepError.ts` appends outside this schema file. Declared as a
 * getter because a `message` field would change the error's encoded shape.
 */
export class StepFailure extends Schema.TaggedError<StepFailure, { readonly brand: unique symbol }>()('StepError', {
  keyword: Schema.String,
  text: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `${capitalized(this.keyword)} "${this.text}" failed`
  }
}
