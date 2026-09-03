import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  MutantDryError,
  MutantKilled,
  MutantSurvived,
  MutantTimeout,
  VitestMutantRunCommand,
  VitestMutantRunError,
  type VitestMutantRunOutput,
  vitestMutantRunWorkflow,
} from '../VitestMutantRun.workflow.js'

const VITEST_MUTANT_RUN_FAMILY = Symbol.for('@systemfsoftware/stryker-js-vitest-runner/VitestMutantRun')

const carriesFamilyBrand = (decision: object): boolean =>
  Reflect.get(decision, VITEST_MUTANT_RUN_FAMILY) === VITEST_MUTANT_RUN_FAMILY

const tagOf = (result: Result.Result<VitestMutantRunOutput, VitestMutantRunError>): string | null =>
  Match.value(result).pipe(
    Match.tag('Success', ({ success }) => success._tag),
    Match.tag('Failure', ({ failure }) => failure._tag),
    Match.exhaustive,
  )

const commandWith = (
  input: VitestMutantRunCommand,
  override: {
    readonly rawTests?: readonly unknown[]
    readonly hasExternalError?: boolean
    readonly externalErrorText?: string
    readonly hitCount: number | undefined
    readonly hitLimit: number | undefined
    readonly reportAllKillers?: boolean
  },
): VitestMutantRunCommand =>
  VitestMutantRunCommand.make({
    rawTests: [...(override.rawTests ?? input.rawTests)],
    projectRoot: input.projectRoot,
    hasExternalError: override.hasExternalError ?? input.hasExternalError,
    externalErrorText: override.externalErrorText ?? input.externalErrorText,
    hitCount: override.hitCount,
    hitLimit: override.hitLimit,
    reportAllKillers: override.reportAllKillers ?? input.reportAllKillers,
  })

const testsIn = (
  testsJson: string,
): { readonly ids: readonly string[]; readonly failed: readonly string[] } | null => {
  const parsed: unknown = JSON.parse(testsJson)
  if (!Array.isArray(parsed)) {
    return null
  }
  const items: readonly unknown[] = parsed
  const ids: string[] = []
  const failed: string[] = []
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || typeof entry.id !== 'string') {
      return null
    }
    ids.push(entry.id)
    if ('status' in entry && entry.status === 'failed') {
      failed.push(entry.id)
    }
  }
  return { ids, failed }
}

describe('vitestMutantRunWorkflow', () => {
  it.prop(
    '∀c_Decision_≡BrandedAndKnown',
    [Schema.toArbitrary(VitestMutantRunCommand)(fc)],
    ([input]) => {
      const result = vitestMutantRunWorkflow(input)
      const tag = tagOf(result)
      const known = tag === 'Killed' ||
        tag === 'Survived' ||
        tag === 'Timeout' ||
        tag === 'Error' ||
        tag === 'VitestMutantRunError'
      if (!known) {
        return false
      }
      if (Result.isSuccess(result)) {
        return carriesFamilyBrand(result.success)
      }
      return carriesFamilyBrand(result.failure)
    },
  )

  it.prop(
    '→h_HitLimitExceeded_=Timeout',
    [
      Schema.toArbitrary(VitestMutantRunCommand)(fc),
      fc.integer({ min: 0, max: 100000 }),
      fc.integer({ min: 1, max: 100 }),
    ],
    ([input, hitLimit, extra]) => {
      const hitCount = hitLimit + extra
      const result = vitestMutantRunWorkflow(commandWith(input, { hitCount, hitLimit }))
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantTimeout)(result.success)) {
        return false
      }
      return (
        carriesFamilyBrand(result.success) &&
        result.success.testsJson === '[]' &&
        result.success.reason === `Hit limit reached (${hitCount}/${hitLimit})`
      )
    },
  )

  it.prop(
    '→e_ExternalErrorAlone_=DryError',
    [Schema.toArbitrary(VitestMutantRunCommand)(fc)],
    ([input]) => {
      const result = vitestMutantRunWorkflow(
        commandWith(input, {
          rawTests: [],
          hasExternalError: true,
          hitCount: undefined,
          hitLimit: undefined,
        }),
      )
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantDryError)(result.success)) {
        return false
      }
      return (
        carriesFamilyBrand(result.success) &&
        result.success.testsJson === '[]' &&
        result.success.errorMessage === `An error occurred outside of a test run: ${input.externalErrorText}`
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
      const result = vitestMutantRunWorkflow(
        commandWith(input, {
          rawTests: [
            {
              name,
              result: { state: 'fail', duration: 5, errors: [{ message }] },
              file: { filepath: `${input.projectRoot}/tests/a.spec.ts` },
            },
          ],
          hasExternalError: false,
          hitCount: undefined,
          hitLimit: undefined,
        }),
      )
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantKilled)(result.success)) {
        return false
      }
      if (!carriesFamilyBrand(result.success)) {
        return false
      }
      const tests = testsIn(result.success.testsJson)
      if (tests === null) {
        return false
      }
      const killerIds = result.success.killerIds
      return (
        tests.failed.length === 1 &&
        killerIds !== undefined &&
        killerIds.length === 1 &&
        killerIds[0] === tests.failed[0] &&
        result.success.failureMessage === message
      )
    },
  )

  it.prop(
    '→t_PassedTest_=Survived',
    [Schema.toArbitrary(VitestMutantRunCommand)(fc), fc.string({ minLength: 1, maxLength: 24 })],
    ([input, name]) => {
      const result = vitestMutantRunWorkflow(
        commandWith(input, {
          rawTests: [
            {
              name,
              result: { state: 'pass', duration: 3 },
              file: { filepath: `${input.projectRoot}/tests/a.spec.ts` },
            },
          ],
          hasExternalError: false,
          hitCount: undefined,
          hitLimit: undefined,
        }),
      )
      if (!Result.isSuccess(result)) {
        return false
      }
      if (!S.is(MutantSurvived)(result.success)) {
        return false
      }
      if (!carriesFamilyBrand(result.success)) {
        return false
      }
      const tests = testsIn(result.success.testsJson)
      if (tests === null) {
        return false
      }
      return tests.ids.length === 1 && tests.failed.length === 0
    },
  )
})
