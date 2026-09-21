import { DisparityError } from '@systemfsoftware/differential-spec'
import { Cause, Exit, Option, Schema } from 'effect'

export const disparityReportOf = (outcome: Exit.Exit<void, DisparityError>): string => {
  if (Exit.isSuccess(outcome)) throw new Error('expected the parity run to fail')
  const maybeError = Cause.findErrorOption(outcome.cause)
  if (Option.isNone(maybeError)) throw new Error('expected the failure to carry a typed error')
  const value = maybeError.value
  if (!Schema.is(DisparityError)(value)) throw new Error('expected the typed error to be a disparity report')
  return value.report
}
