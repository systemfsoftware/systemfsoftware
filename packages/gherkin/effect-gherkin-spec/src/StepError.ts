import { summaryOf } from '@systemfsoftware/vitest/failure'
import type { Schema } from 'effect'
import { StepFailure } from './StepError.schema.js'

type Cause = Schema.Unknown['Type']

const isNullish = (cause: Cause): cause is null | undefined => cause === null || cause === undefined

const causeSummaryOf = (cause: Cause): string => isNullish(cause) ? '' : summaryOf(cause)

/**
 * A step failure as a reader sees it: the headline from `StepFailure`, followed by the summary of
 * the cause when there is one.
 */
export class StepError extends StepFailure {
  override get message(): string {
    const summary = causeSummaryOf(this.cause)
    return summary === '' ? super.message : `${super.message}: ${summary}`
  }
}
