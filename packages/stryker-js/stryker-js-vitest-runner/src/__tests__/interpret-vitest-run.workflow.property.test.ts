import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  interpretVitestRun,
  MutantKilled,
  MutantSurvived,
  MutantTimeout,
  VitestMutantRunCommand,
  VitestMutantRunError,
} from '../interpret-vitest-run.workflow.js'
import type { VitestTestTask } from '../Runner.schema.js'

const VITEST_MUTANT_RUN_FAMILY = Symbol.for('@systemfsoftware/stryker-js-vitest-runner/VitestMutantRun')

const carriesFamilyBrand = (decision: object): boolean =>
  Reflect.get(decision, VITEST_MUTANT_RUN_FAMILY) === VITEST_MUTANT_RUN_FAMILY

const failedTask = (name: string, message: string): VitestTestTask => ({
  name,
  result: { state: 'fail', duration: 5, errors: [{ message }] },
})

const passedTask = (name: string): VitestTestTask => ({
  name,
  result: { state: 'pass', duration: 3 },
})

const commandFrom = (input: VitestMutantRunCommand, tests: readonly VitestTestTask[], reportAllKillers: boolean) =>
  VitestMutantRunCommand.make({
    tests,
    projectRoot: input.projectRoot,
    hasExternalError: false,
    externalErrorText: input.externalErrorText,
    hitCount: undefined,
    hitLimit: undefined,
    reportAllKillers,
  })

describe('interpretVitestRun', () => {
  it.prop(
    '→h_HitLimitExceeded_=Timeout',
    [
      Schema.toArbitrary(VitestMutantRunCommand)(fc),
      fc.integer({ min: 0, max: 100000 }),
      fc.integer({ min: 1, max: 100 }),
    ],
    ([input, hitLimit, extra]) => {
      const hitCount = hitLimit + extra
      const result = interpretVitestRun(
        VitestMutantRunCommand.make({
          tests: input.tests,
          projectRoot: input.projectRoot,
          hasExternalError: input.hasExternalError,
          externalErrorText: input.externalErrorText,
          hitCount,
          hitLimit,
          reportAllKillers: input.reportAllKillers,
        }),
      )
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantTimeout)(result.success)) {
        return false
      }
      return (
        carriesFamilyBrand(result.success) &&
        result.success.reason === `Hit limit reached (${hitCount}/${hitLimit})`
      )
    },
  )

  it.prop(
    '→e_ExternalErrorAlone_=Abort',
    [Schema.toArbitrary(VitestMutantRunCommand)(fc)],
    ([input]) => {
      const result = interpretVitestRun(
        VitestMutantRunCommand.make({
          tests: [],
          projectRoot: input.projectRoot,
          hasExternalError: true,
          externalErrorText: input.externalErrorText,
          hitCount: undefined,
          hitLimit: undefined,
          reportAllKillers: input.reportAllKillers,
        }),
      )
      if (!Result.isFailure(result)) {
        return false
      }
      if (!S.is(VitestMutantRunError)(result.failure)) {
        return false
      }
      return (
        carriesFamilyBrand(result.failure) &&
        result.failure.message === `An error occurred outside of a test run: ${input.externalErrorText}`
      )
    },
  )

  it.prop(
    '→t_FailedTest_=Killed',
    [
      Schema.toArbitrary(VitestMutantRunCommand)(fc),
      fc.string({ minLength: 1, maxLength: 24 }),
      fc.string({ maxLength: 32 }),
    ],
    ([input, name, message]) => {
      const trimmed = name.trim()
      const result = interpretVitestRun(commandFrom(input, [failedTask(name, message)], false))
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantKilled)(result.success)) {
        return false
      }
      if (!carriesFamilyBrand(result.success)) {
        return false
      }
      const killerIds = result.success.killerIds
      return (
        result.success.tests.length === 1 &&
        result.success.tests[0].id.endsWith(`#${trimmed}`) &&
        result.success.tests[0].name === trimmed &&
        result.success.failureMessage === message &&
        killerIds !== undefined &&
        killerIds.length === 1 &&
        killerIds[0] === result.success.tests[0].id
      )
    },
  )

  it.prop(
    '→t_ReportAllKillers_=EveryKillerId',
    [
      Schema.toArbitrary(VitestMutantRunCommand)(fc),
      fc.string({ minLength: 1, maxLength: 24 }),
      fc.string({ minLength: 1, maxLength: 24 }),
      fc.string({ maxLength: 32 }),
    ],
    ([input, firstName, secondName, message]) => {
      const result = interpretVitestRun(
        commandFrom(
          input,
          [failedTask(firstName, message), failedTask(secondName, message)],
          true,
        ),
      )
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantKilled)(result.success)) {
        return false
      }
      const killerIds = result.success.killerIds
      return (
        result.success.tests.length === 2 &&
        killerIds !== undefined &&
        killerIds.length === 2 &&
        killerIds[0] === result.success.tests[0].id &&
        killerIds[1] === result.success.tests[1].id
      )
    },
  )

  it.prop(
    '→t_PassedTest_=Survived',
    [Schema.toArbitrary(VitestMutantRunCommand)(fc), fc.string({ minLength: 1, maxLength: 24 })],
    ([input, name]) => {
      const trimmed = name.trim()
      const result = interpretVitestRun(commandFrom(input, [passedTask(name)], false))
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantSurvived)(result.success)) {
        return false
      }
      if (!carriesFamilyBrand(result.success)) {
        return false
      }
      return (
        result.success.tests.length === 1 &&
        result.success.tests[0].status === 'success' &&
        result.success.tests[0].name === trimmed
      )
    },
  )
})
