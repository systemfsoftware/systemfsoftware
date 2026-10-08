import { Effect, Schema as S } from 'effect'

export const DEFAULT_TEST_FILE_PATTERN = '\\.(?:test|spec)\\.[cm]?[jt]sx?$|\\.stories\\.tsx$'

export const Options = S.Struct({
  testFilePattern: S.String.pipe(
    S.annotate({
      description:
        'Regular expression source tested against the file path; the rule judges only a path that matches. Defaults to test/spec files and Storybook stories. A consumer whose tests live in another directory adds it to the pattern.',
    }),
    S.withDecodingDefaultType(Effect.succeed(DEFAULT_TEST_FILE_PATTERN)),
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const WAIT_FOR_TIMEOUT_MESSAGE =
  '`waitForTimeout(...)` sleeps for a fixed time, so the test is slow when the app is fast and flaky when it is slow. Wait for the condition instead: Playwright web-first assertions such as `await expect(locator).toBeVisible()` auto-retry.' as const

export const BARE_SET_TIMEOUT_MESSAGE =
  "`setTimeout(` schedules a fixed delay; a test that sleeps on a timer is slow and flaky. Wait for the condition instead: a web-first assertion (`expect(locator).toBeVisible()`), `expect.poll(...)`, or vitest's `vi.waitFor(...)`." as const

export const EFFECT_SLEEP_MESSAGE =
  '`Effect.sleep(` suspends the fiber for a fixed duration, so the test is slow and flaky. Wait for the condition instead: `Effect.repeat` with a schedule, or a `TestClock` adjustment.' as const

export const PROMISE_SET_TIMEOUT_MESSAGE =
  'This `new Promise` executor calls `setTimeout`, hand-building a timer wait that is slow and flaky. Wait for the condition instead: a web-first assertion, `expect.poll(...)`, or `vi.waitFor(...)`.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test waits for a condition, never for a fixed time. Which paths count as tests is the testFilePattern option, defaulting to test/spec files and Storybook stories.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    waitForTimeout: WAIT_FOR_TIMEOUT_MESSAGE,
    bareSetTimeout: BARE_SET_TIMEOUT_MESSAGE,
    effectSleep: EFFECT_SLEEP_MESSAGE,
    promiseSetTimeout: PROMISE_SET_TIMEOUT_MESSAGE,
  },
} as const
