import type { ScenarioFn } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { describe, expect, test } from 'tstyche'
import type { ScenarioTitle, ScenarioTitleRejected } from '../../src/FeatureRuntime.js'

const DAMP_UNDERSCORE = 'Should_CreditASoleKill_When_OnlyOneFileKilledTheMutant'
const DAMP_SPACE = 'Should add binding when Given step succeeds'
const DAMP_CONCATENATED = 'ShouldReportRegression_When_CheckFails'
const PROSE = 'A check that starts failing is reported as a regression'

describe('scenario-title brand', () => {
  test('Should_RejectDAMPUnderscoreTitle_When_ScenarioStartsWithShould', () => {
    expect<ScenarioTitle<typeof DAMP_UNDERSCORE>>().type.toBe<ScenarioTitleRejected<typeof DAMP_UNDERSCORE>>()
    expect<ScenarioTitle<typeof DAMP_UNDERSCORE>>().type.not.toBe<typeof DAMP_UNDERSCORE>()
  })

  test('Should_RejectDAMPSpaceTitle_When_ScenarioStartsWithShould', () => {
    expect<ScenarioTitle<typeof DAMP_SPACE>>().type.toBe<ScenarioTitleRejected<typeof DAMP_SPACE>>()
  })

  test('Should_RejectDAMPConcatenatedTitle_When_ScenarioStartsWithShould', () => {
    expect<ScenarioTitle<typeof DAMP_CONCATENATED>>().type.toBe<ScenarioTitleRejected<typeof DAMP_CONCATENATED>>()
  })

  test('Should_RejectConcatenatedTokenTitle_When_NoSpaceSeparatesWords', () => {
    const CONCATENATED_NO_SHOULD = 'Reports_A_Regression_When_Check_Fails'
    const CAMEL_CASE_NO_SHOULD = 'ACheckThatFailsIsReportedAsARegression'
    const SNAKE_CASE_NO_SHOULD = 'reports_a_regression_when_check_fails'
    expect<ScenarioTitle<typeof CONCATENATED_NO_SHOULD>>().type.toBe<
      ScenarioTitleRejected<typeof CONCATENATED_NO_SHOULD>
    >()
    expect<ScenarioTitle<typeof CAMEL_CASE_NO_SHOULD>>().type.toBe<
      ScenarioTitleRejected<typeof CAMEL_CASE_NO_SHOULD>
    >()
    expect<ScenarioTitle<typeof SNAKE_CASE_NO_SHOULD>>().type.toBe<
      ScenarioTitleRejected<typeof SNAKE_CASE_NO_SHOULD>
    >()
  })

  test('Should_RejectSingleWordTitle_When_NoSpaceSeparatesWords', () => {
    const SINGLE_WORD = 'Login'
    expect<ScenarioTitle<typeof SINGLE_WORD>>().type.toBe<ScenarioTitleRejected<typeof SINGLE_WORD>>()
  })

  test('Should_LeaveProseTitleUnbranded_When_ScenarioNamesAConsumerVisibleSituation', () => {
    expect<ScenarioTitle<typeof PROSE>>().type.toBe<typeof PROSE>()
    expect<ScenarioFn>().type.toBeCallableWith(PROSE, Effect.succeed('x'))
  })
})
