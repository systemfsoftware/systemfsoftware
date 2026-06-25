import { Schema } from 'effect'

/**
 * Error wrapping a failure inside a Gherkin step.
 * Preserves the keyword, step text, and original cause for diagnostic output.
 */
export class StepError extends Schema.TaggedError<StepError>()('StepError', {
  keyword: Schema.String,
  text: Schema.String,
  cause: Schema.Unknown,
}) {}
