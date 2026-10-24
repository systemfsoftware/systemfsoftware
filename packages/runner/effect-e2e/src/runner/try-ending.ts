import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { Attempt, RanAttempt } from '../report/report.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import { FailureCode, type FailureRecord } from '../verdict/failure.schema.js'
import { AttemptFailed } from './try-failure.schema.js'

export interface BodyError {
  readonly name?: string | undefined
  readonly message?: string | undefined
}

const isFailureCode = Schema.is(FailureCode)

const recordedByItsStep = (error: BodyError): boolean => isFailureCode(error.name)

const codeOf = (
  error: BodyError,
): FailureCode => (error.name === 'AssertionError' ? 'ASSERTION_FAILED' : 'INTERNAL_ERROR')

const nameOf = (error: BodyError): string => error.name ?? 'Error'

const messageOf = (error: BodyError): string => error.message ?? ''

const recordOf = (error: BodyError): FailureRecord => {
  const code = codeOf(error)
  return {
    code,
    cause: failureClassOf(code).cause,
    evidence: [{ _tag: 'LogEvidence', text: `${nameOf(error)}: ${messageOf(error)}` }],
  }
}

export const bodyFailuresOf = (errors: ReadonlyArray<BodyError>): ReadonlyArray<FailureRecord> =>
  Arr.map(Arr.filter(errors, (error) => !recordedByItsStep(error)), recordOf)

const ranFailureOf = (ran: RanAttempt): Option.Option<AttemptFailed> =>
  ran.status === 'passed'
    ? Option.none()
    : Option.some(new AttemptFailed({ status: ran.status, codes: Arr.map(ran.errors, (error) => error.code) }))

export const attemptFailureOf = (attempt: Attempt): Option.Option<AttemptFailed> =>
  Match.valueTags(attempt, {
    Ran: ranFailureOf,
    Skipped: (): Option.Option<AttemptFailed> => Option.none(),
  })
