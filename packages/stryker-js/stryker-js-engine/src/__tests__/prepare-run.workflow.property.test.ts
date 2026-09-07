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
  it.prop(
    '∀d_Brand_∈Decision',
    [
      fc.constantFrom(
        new PreparePlanned({ fileCount: 1, mutateCount: 1 }),
        new PrepareRefused({ reason: 'No input files found.' }),
      ),
    ],
    ([decision]) => Object.getOwnPropertySymbols(decision).includes(PrepareDecisionTypeId),
  )
  it.prop('∀c_Command_≡Decision', [S.toArbitrary(PrepareCommand)(fc)], ([command]) => {
    const result = prepareRun(command)
    if (command.fileCount < 0) {
      return (
        Result.isFailure(result) &&
        S.is(PrepareWorkflowError)(result.failure) &&
        result.failure.reason === 'Invalid file count'
      )
    }
    if (command.fileCount === 0) {
      return (
        Result.isSuccess(result) &&
        S.is(PrepareRefused)(result.success) &&
        result.success.reason === 'No input files found.'
      )
    }
    return (
      Result.isSuccess(result) &&
      S.is(PreparePlanned)(result.success) &&
      result.success.fileCount === command.fileCount &&
      result.success.mutateCount === command.mutateCount
    )
  })
})
