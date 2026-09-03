import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { DryRunCommand, DryRunError, DryRunFailed, DryRunPassed, dryRunWorkflow } from '../DryRun.workflow.js'

const DryRunDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/DryRunDecision')

describe('dryRunWorkflow', () => {
  it.prop(
    '∀d_Brand_∈Decision',
    [
      fc.constantFrom(
        new DryRunPassed({ testCount: 1 }),
        new DryRunFailed({ testCount: 2, failedTestCount: 1 }),
      ),
    ],
    ([decision]) => Object.getOwnPropertySymbols(decision).includes(DryRunDecisionTypeId),
  )
  it.prop('∀c_Command_≡Decision', [S.toArbitrary(DryRunCommand)(fc)], ([command]) => {
    const result = dryRunWorkflow(command)
    if (command.status === 'Error') {
      return (
        Result.isFailure(result) &&
        S.is(DryRunError)(result.failure) &&
        result.failure.stage === 'dryRun'
      )
    }
    if (command.status === 'Timeout') {
      return (
        Result.isFailure(result) &&
        S.is(DryRunError)(result.failure) &&
        result.failure.stage === 'dryRun'
      )
    }
    if (command.testCount === 0 && command.allowEmpty === false) {
      return (
        Result.isFailure(result) &&
        S.is(DryRunError)(result.failure) &&
        result.failure.stage === 'dryRunNoTests'
      )
    }
    if (command.failedTestCount > 0) {
      return (
        Result.isSuccess(result) &&
        S.is(DryRunFailed)(result.success) &&
        result.success.testCount === command.testCount &&
        result.success.failedTestCount === command.failedTestCount
      )
    }
    return (
      Result.isSuccess(result) &&
      S.is(DryRunPassed)(result.success) &&
      result.success.testCount === command.testCount
    )
  })
})
