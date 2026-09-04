import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  classifyRunOutcome,
  RunConfigFailed,
  RunFailed,
  RunInterrupted,
  RunOk,
  RunOutcomeCommand,
  type RunOutcomeDecision,
  type RunOutcomeError,
  RunParseFailed,
  RunSurvivorsRejected,
} from '../classify-run-outcome.workflow.js'

const classCode = (exitClass: 'VerdictFail' | 'ConfigError' | 'RuntimeError' | 'InternalError'): number => {
  if (exitClass === 'VerdictFail') {
    return 1
  }
  if (exitClass === 'ConfigError') {
    return 2
  }
  if (exitClass === 'RuntimeError') {
    return 3
  }
  return 4
}

const isRunFailed = (
  result: Result.Result<RunOutcomeDecision, RunOutcomeError>,
  code: number,
  diagnostic: string | undefined,
): boolean =>
  Result.isSuccess(result) &&
  S.is(RunFailed)(result.success) &&
  result.success.code === code &&
  result.success.diagnostic === diagnostic

describe('classifyRunOutcome', () => {
  it.prop('∀c_Command_≡TaggedOutcome', [S.toArbitrary(RunOutcomeCommand)(fc)], ([command]) => {
    const result = classifyRunOutcome(command)
    if (command.signal !== undefined) {
      const code = 128 + command.signal
      return Result.isFailure(result) && S.is(RunInterrupted)(result.failure) && result.failure.code === code
    }
    if (command.succeeded) {
      if (command.successExitClass !== undefined) {
        const code = classCode(command.successExitClass)
        return isRunFailed(result, code, command.diagnostic)
      }
      return Result.isSuccess(result) && S.is(RunOk)(result.success) && result.success.help === false
    }
    if (command.interrupted) {
      return Result.isFailure(result) && S.is(RunInterrupted)(result.failure) && result.failure.code === 1
    }
    if (command.helpErrorCount !== undefined) {
      if (command.helpErrorCount > 0) {
        return (
          Result.isSuccess(result) &&
          S.is(RunParseFailed)(result.success) &&
          result.success.unrecognized === command.unrecognized
        )
      }
      return Result.isSuccess(result) && S.is(RunOk)(result.success) && result.success.help === true
    }
    if (command.cliError) {
      return (
        Result.isSuccess(result) &&
        S.is(RunParseFailed)(result.success) &&
        result.success.unrecognized === command.unrecognized
      )
    }
    if (command.survivorsReason !== undefined) {
      return (
        Result.isSuccess(result) &&
        S.is(RunSurvivorsRejected)(result.success) &&
        result.success.reason === command.survivorsReason &&
        result.success.diagnostic === command.survivorsDiagnostic
      )
    }
    if (command.schemaError) {
      return (
        Result.isSuccess(result) &&
        S.is(RunConfigFailed)(result.success) &&
        result.success.detail === command.configDetail
      )
    }
    if (command.highestExitClass !== undefined) {
      if (command.highestExitClass === 'ConfigError') {
        return (
          Result.isSuccess(result) &&
          S.is(RunConfigFailed)(result.success) &&
          result.success.detail === command.configDetail
        )
      }
      const code = classCode(command.highestExitClass)
      return isRunFailed(result, code, command.diagnostic)
    }
    return isRunFailed(result, 1, command.diagnostic)
  })
})
