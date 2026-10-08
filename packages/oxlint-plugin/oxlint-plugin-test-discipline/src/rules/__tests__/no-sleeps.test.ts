import { noSleeps } from '../no-sleeps.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const TEST = '/repo/pkg/tests/flow.spec.ts'
const SOURCE = '/repo/pkg/src/a.ts'

ruleTester.run('no-sleeps', noSleeps, {
  valid: [
    {
      name: 'Should_StaySilent_When_TimeoutSitsOutsideATestFile',
      code: 'setTimeout(() => {}, 0)',
      filename: SOURCE,
    },
    {
      name: 'Should_StaySilent_When_TestPollsWithExpectPoll',
      code: "await expect.poll(() => status()).toBe('done')",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_TestWaitsWithViWaitFor',
      code: 'await vi.waitFor(() => ready())',
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_TestUsesAWebFirstAssertion',
      code: "await expect(page.getByRole('button')).toBeVisible()",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_TestSchedulesAMicrotask',
      code: 'queueMicrotask(() => {})',
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_PromiseExecutorDoesNotSetTimeout',
      code: 'new Promise((resolve) => resolve(1))',
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_NonTimerObjectSetTimeout',
      code: 'page.setTimeout(() => {}, 0)',
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_CustomPatternDoesNotMatchTheFile',
      code: 'setTimeout(() => {}, 0)',
      filename: '/repo/e2e/specs/flow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PlaywrightWaitForTimeoutSleeps',
      code: 'await page.waitForTimeout(1000)',
      filename: TEST,
      errors: [{ messageId: 'waitForTimeout' }],
    },
    {
      name: 'Should_Report_When_BareSetTimeoutSleeps',
      code: 'setTimeout(() => {}, 0)',
      filename: TEST,
      errors: [{ messageId: 'bareSetTimeout' }],
    },
    {
      name: 'Should_Report_When_EffectSleepSuspendsTheFiber',
      code: "Effect.sleep('1 second')",
      filename: TEST,
      errors: [{ messageId: 'effectSleep' }],
    },
    {
      name: 'Should_Report_When_PromiseExecutorSetTimeouts',
      code: 'new Promise((resolve) => setTimeout(resolve, 0))',
      filename: TEST,
      errors: [{ messageId: 'promiseSetTimeout' }],
    },
    {
      name: 'Should_Report_When_TimerGlobalSetTimeoutSleeps',
      code: 'window.setTimeout(() => {}, 0)',
      filename: TEST,
      errors: [{ messageId: 'bareSetTimeout' }],
    },
    {
      name: 'Should_Report_When_CustomPatternMatchesTheFile',
      code: 'setTimeout(() => {}, 0)',
      filename: '/repo/e2e/specs/flow.ts',
      options: [{ testFilePattern: 'e2e/specs/' }],
      errors: [{ messageId: 'bareSetTimeout' }],
    },
  ],
})
