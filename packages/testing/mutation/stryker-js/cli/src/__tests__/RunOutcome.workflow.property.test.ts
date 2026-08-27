import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  RunConfigFailed,
  RunFailed,
  RunInterrupted,
  RunOk,
  RunOutcomeCommand,
  runOutcomeWorkflow,
  RunParseFailed,
  RunSurvivorsRejected,
} from '../RunOutcome.workflow.js'

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

describe('runOutcomeWorkflow', () => {
  it.prop('∀c_Command_≡TaggedOutcome', [S.toArbitrary(RunOutcomeCommand)(fc)], ([command]) => {
    const result = runOutcomeWorkflow(command)
    if (command.signal !== undefined) {
      const code = 128 + command.signal
      return Result.isFailure(result) && S.is(RunInterrupted)(result.failure) && result.failure.code === code
    }
    if (command.succeeded) {
      if (command.successExitClass !== undefined) {
        const code = classCode(command.successExitClass)
        return (
          Result.isFailure(result) &&
          S.is(RunFailed)(result.failure) &&
          result.failure.code === code &&
          result.failure.diagnostic === command.diagnostic
        )
      }
      return Result.isSuccess(result) && S.is(RunOk)(result.success) && result.success.help === false
    }
    if (command.interrupted) {
      return Result.isFailure(result) && S.is(RunInterrupted)(result.failure) && result.failure.code === 1
    }
    if (command.helpErrorCount !== undefined) {
      if (command.helpErrorCount > 0) {
        return (
          Result.isFailure(result) &&
          S.is(RunParseFailed)(result.failure) &&
          result.failure.unrecognized === command.unrecognized
        )
      }
      return Result.isSuccess(result) && S.is(RunOk)(result.success) && result.success.help === true
    }
    if (command.cliError) {
      return (
        Result.isFailure(result) &&
        S.is(RunParseFailed)(result.failure) &&
        result.failure.unrecognized === command.unrecognized
      )
    }
    if (command.survivorsReason !== undefined) {
      return (
        Result.isFailure(result) &&
        S.is(RunSurvivorsRejected)(result.failure) &&
        result.failure.reason === command.survivorsReason &&
        result.failure.diagnostic === command.survivorsDiagnostic
      )
    }
    if (command.schemaError) {
      return (
        Result.isFailure(result) &&
        S.is(RunConfigFailed)(result.failure) &&
        result.failure.detail === command.configDetail
      )
    }
    if (command.highestExitClass !== undefined) {
      if (command.highestExitClass === 'ConfigError') {
        return (
          Result.isFailure(result) &&
          S.is(RunConfigFailed)(result.failure) &&
          result.failure.detail === command.configDetail
        )
      }
      const code = classCode(command.highestExitClass)
      return (
        Result.isFailure(result) &&
        S.is(RunFailed)(result.failure) &&
        result.failure.code === code &&
        result.failure.diagnostic === command.diagnostic
      )
    }
    return (
      Result.isFailure(result) &&
      S.is(RunFailed)(result.failure) &&
      result.failure.code === 1 &&
      result.failure.diagnostic === command.diagnostic
    )
  })
})
