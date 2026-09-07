import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  PrepareCommand,
  PreparePlanned,
  PrepareRefused,
  prepareRun,
  PrepareWorkflowError,
} from '../prepare-run.workflow.js'

const PrepareDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/PrepareDecision')

describe('prepareRun', () => {
  it.prop('∀c_Fail_≡fileCount<0', [S.toArbitrary(PrepareCommand)(fc)], ([command]) => {
    const result = prepareRun(command)
    if (command.fileCount < 0) {
      return Result.isFailure(result) && S.is(PrepareWorkflowError)(result.failure)
    }
    return Result.isSuccess(result)
  })
  it.prop('∀c_Decision_∈branded∧conserved', [S.toArbitrary(PrepareCommand)(fc)], ([command]) => {
    const result = prepareRun(command)
    if (command.fileCount < 0) return true
    if (!Result.isSuccess(result)) return false
    if (!Object.getOwnPropertySymbols(result.success).includes(PrepareDecisionTypeId)) return false
    if (command.fileCount === 0) {
      return S.is(PrepareRefused)(result.success)
    }
    return (
      S.is(PreparePlanned)(result.success) &&
      result.success.fileCount === command.fileCount &&
      result.success.mutateCount === command.mutateCount
    )
  })
})
