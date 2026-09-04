import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  admitMutationTest,
  MutationTestDryRunOnly,
  MutationTestError,
  MutationTestNoTests,
  MutationTestProceed,
} from '../admit-mutation-test.workflow.js'
import { MutationTestCommand } from '../MutationTest.schema.js'

const MutationTestDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/MutationTestDecision')

describe('admitMutationTest', () => {
  it.prop(
    '∀d_Brand_∈Decision',
    [
      fc.constantFrom(
        new MutationTestProceed({}),
        new MutationTestDryRunOnly({}),
        new MutationTestNoTests({}),
      ),
    ],
    ([decision]) => Object.getOwnPropertySymbols(decision).includes(MutationTestDecisionTypeId),
  )
  it.prop('∀c_Command_≡Decision', [S.toArbitrary(MutationTestCommand)(fc)], ([command]) => {
    const result = admitMutationTest(command)
    if (command.testCount < 0) {
      return Result.isFailure(result) && S.is(MutationTestError)(result.failure)
    }
    if (command.dryRunOnly) {
      return Result.isSuccess(result) && S.is(MutationTestDryRunOnly)(result.success)
    }
    if (command.isZero && command.allowEmpty) {
      return Result.isSuccess(result) && S.is(MutationTestNoTests)(result.success)
    }
    return Result.isSuccess(result) && S.is(MutationTestProceed)(result.success)
  })
})
