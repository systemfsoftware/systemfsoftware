import { summaryOf } from '@systemfsoftware/vitest/failure'
import { Schema } from 'effect'

type Cause = Schema.Unknown['Type']

const isNullish = (cause: Cause): cause is null | undefined => cause === null || cause === undefined

const causeSummaryOf = (cause: Cause): string => isNullish(cause) ? '' : summaryOf(cause)

const capitalized = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const headlineOf = (keyword: string, text: string): string => `${capitalized(keyword)} "${text}" failed`

const messageOf = (keyword: string, text: string, cause: Cause): string => {
  const summary = causeSummaryOf(cause)
  return summary === '' ? headlineOf(keyword, text) : `${headlineOf(keyword, text)}: ${summary}`
}

/**
 * Derives `message` from `keyword`, `text` and `cause`, so a step failure never prints an empty
 * headline. Declared as a getter because a `message` field would change the error's encoded shape.
 */
export class StepError extends Schema.TaggedError<StepError>()('StepError', {
  keyword: Schema.String,
  text: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return messageOf(this.keyword, this.text, this.cause)
  }
}
