import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  EphemeralInstrument,
  InPlaceInstrument,
  InstrumentCommand,
  InstrumentError,
  planInstrumentation,
} from '../plan-instrumentation.workflow.js'

const InstrumentDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/InstrumentDecision')

describe('planInstrumentation', () => {
  it.prop(
    '∀d_Brand_∈Decision',
    [
      fc.constantFrom(
        new InPlaceInstrument({ workingDirectoryHint: 'inPlace', backupDirectoryHint: 'backup', fileCount: 1 }),
        new EphemeralInstrument({ workingDirectoryHint: 'temp', fileCount: 1 }),
      ),
    ],
    ([decision]) => Object.getOwnPropertySymbols(decision).includes(InstrumentDecisionTypeId),
  )
  it.prop('∀c_Command_≡Decision', [S.toArbitrary(InstrumentCommand)(fc)], ([command]) => {
    const result = planInstrumentation(command)
    if (command.fileCount === 0) {
      return Result.isFailure(result) && S.is(InstrumentError)(result.failure)
    }
    if (command.inPlace) {
      return (
        Result.isSuccess(result) &&
        S.is(InPlaceInstrument)(result.success) &&
        result.success.fileCount === command.fileCount
      )
    }
    return (
      Result.isSuccess(result) &&
      S.is(EphemeralInstrument)(result.success) &&
      result.success.fileCount === command.fileCount
    )
  })
})
