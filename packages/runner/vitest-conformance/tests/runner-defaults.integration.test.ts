import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Check, Expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import {
  assertionOf,
  fileOf,
  type JsonReport,
  messagesOf,
  namesOf,
  runFixtures,
  runProbes,
} from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const refusal = {
  noCheck:
    "✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.",
  syncBody:
    '✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
} as const

const statusesOf = (file: {
  readonly assertionResults: ReadonlyArray<{ readonly status: string }>
}): ReadonlyArray<string> => file.assertionResults.map((assertion) => assertion.status)

const fileStatusCheck = (expect: Expect, report: JsonReport, stem: string): Check =>
  expect({ status: fileOf(report, stem).status }).toMatchObject({ status: 'passed' })

Feature('Fork runner defaults')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'two tests in one fresh layer each see an empty store',
      Gherkin.Do.pipe(
        Given('a layer block holding an in-memory store')(
          'report',
          () => runFixtures(['runner/isolation.test.ts']),
        ),
        When('both tests run')(
          'file',
          (s) => Effect.succeed(fileOf(s.report, 'runner/isolation.test.ts')),
        ),
        Then('each test passes and each run saw the empty store')((s, expect) =>
          expect({
            status: s.file.status,
            statuses: statusesOf(s.file),
            names: [...namesOf(s.report)].sort(),
          }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed'],
            names: [
              'layer store isolation Should_SeeAnEmptyStore_When_AnotherTestWroteFirst',
              'layer store isolation Should_SeeAnEmptyStore_When_RunningTestAlreadyWrote',
            ],
          })
        ),
      ),
    )

    scenario(
      'a shared layer block shares one build across its tests',
      Gherkin.Do.pipe(
        Given('the same block declared with shared: true')(
          'report',
          () => runFixtures(['runner/shared-layers.test.ts']),
        ),
        Then('the second test sees the first test write')((s, expect) => {
          const file = fileOf(s.report, 'runner/shared-layers.test.ts')
          return expect({ status: file.status, statuses: statusesOf(file) }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed'],
          })
        }),
      ),
    )

    scenario(
      'a nested layer inside a shared block does not rebuild the outer layer',
      Gherkin.Do.pipe(
        Given('a nested block inside a shared parent')(
          'report',
          () => runFixtures(['runner/nested-shared.test.ts']),
        ),
        Then('the nested tests share the outer build')((s, expect) => {
          const file = fileOf(s.report, 'runner/nested-shared.test.ts')
          return expect({
            status: file.status,
            statuses: statusesOf(file),
            outer: [
              assertionOf(s.report, 'nested inside shared nested block Should_SeeOuterState_When_NestedInsideShared')
                .status,
              assertionOf(
                s.report,
                'nested inside shared nested block Should_KeepOuterBuild_When_ANestedTestAlreadyRan',
              ).status,
            ],
          }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed'],
            outer: ['passed', 'passed'],
          })
        }),
      ),
    )

    scenario(
      'a module-level counter makes the second run fail as LeakedState',
      Gherkin.Do.pipe(
        Given('a test reading a module-level counter it increments')(
          'report',
          () => runFixtures(['runner/leak.test.ts']),
        ),
        When('it passes once')(
          'assertion',
          (s) => Effect.succeed(assertionOf(s.report, 'Should_FailTheSecondRun_When_VisibleCounterAdvances')),
        ),
        Then('the report is LeakedState carrying the second run failure')((s, expect) =>
          expect({
            status: s.assertion.status,
            message: messagesOf(s.report, 'Should_FailTheSecondRun_When_VisibleCounterAdvances'),
          }).toMatchObject({ status: 'failed', message: expect.stringContaining('LeakedState') })
        ),
      ),
    )

    scenario(
      'a 3 second tie wakes the background sleeper before the test fiber',
      Gherkin.Do.pipe(
        Given('a background fiber shipping after 3 seconds and a test sleeping 3 seconds')(
          'report',
          () => runFixtures(['runner/clock.test.ts']),
        ),
        Then('the test reads Shipped at virtual 3000 ms')((s, expect) =>
          fileStatusCheck(expect, s.report, 'runner/clock.test.ts')
        ),
      ),
    )

    scenario(
      'a sleep that ends now returns without advancing time',
      Gherkin.Do.pipe(
        Given('a test sleeping zero')('report', () => runFixtures(['runner/sleep-zero.test.ts'])),
        Then('the clock still reads zero')((s, expect) =>
          fileStatusCheck(expect, s.report, 'runner/sleep-zero.test.ts')
        ),
      ),
    )

    scenario(
      'fractional millisecond schedules complete without throwing',
      Gherkin.Do.pipe(
        Given('a jittered 1 ms schedule')('report', () => runFixtures(['runner/jittered.test.ts'])),
        Then('the repeat completes')((s, expect) => fileStatusCheck(expect, s.report, 'runner/jittered.test.ts')),
      ),
    )

    scenario(
      'TestClock.adjust still releases a 3 second sleeper',
      Gherkin.Do.pipe(
        Given('a 3 second sleeper and an adjust of 3 seconds')(
          'report',
          () => runFixtures(['runner/adjust.test.ts']),
        ),
        Then('the sleeper is released')((s, expect) => fileStatusCheck(expect, s.report, 'runner/adjust.test.ts')),
      ),
    )

    scenario(
      'four interleaved concurrent tests fail with only their own failures',
      Gherkin.Do.pipe(
        Given('four concurrent tests each failing distinctly')(
          'report',
          () => runFixtures(['runner/concurrency.test.ts']),
        ),
        Then('each failure message names only its own test')((s, expect) => {
          const first = messagesOf(
            s.report,
            'interleaved concurrent failures Should_ReportOnlyItsFailure_When_FirstTestFails',
          )
          return expect({
            firstNamesItsOwn: first,
            firstExcludesSiblings: first,
          }).toMatchObject({
            firstNamesItsOwn: expect.stringContaining('first-marker'),
            firstExcludesSiblings: expect.not.stringMatching(/second-marker|third-marker|fourth-marker/),
          })
        }),
      ),
    )

    scenario(
      'a shuffled block reports its seed and replays the order with it',
      Gherkin.Do.pipe(
        Given('two tests in one shuffled block')('first', () =>
          Effect.gen(function*() {
            const initial = yield* runProbes({ globs: ['runner/shuffle.test.ts'], shuffle: true })
            const replayed = yield* runProbes({
              globs: ['runner/shuffle.test.ts'],
              shuffle: true,
              seed: initial.seed ?? undefined,
            })
            return { initial, replayed }
          })),
        Then('the seed is reported and the replay matches')((s, expect) => {
          const orderOf = (report: JsonReport): ReadonlyArray<string> =>
            report.testResults.flatMap((file) => file.assertionResults.map((assertion) => assertion.fullName))
          return expect({
            seed: s.first.initial.seed,
            order: orderOf(s.first.replayed.report),
          }).toEqual({ seed: s.first.replayed.seed, order: orderOf(s.first.initial.report) })
        }),
      ),
    )

    scenario(
      'an effect TestClock import resolves to the fork virtual-time clock',
      Gherkin.Do.pipe(
        Given('a probe importing TestClock from the v3 path')(
          'report',
          () => runFixtures(['v3-testclock/adjust.test.ts']),
        ),
        Then('type-checking passes and the sleeper is released')((s, expect) =>
          fileStatusCheck(expect, s.report, 'v3-testclock/adjust.test.ts')
        ),
      ),
    )

    scenario(
      'every row of a table is a test of its own',
      Gherkin.Do.pipe(
        Given('a table whose rows advance a module-level counter')(
          'report',
          () => runFixtures(['runner/each.test.ts']),
        ),
        Then('every row is reported as leaked state')((s, expect) => {
          const rows = fileOf(s.report, 'runner/each.test.ts').assertionResults
          return expect({
            statuses: rows.map((row) => row.status),
            messages: rows.map((row) => row.failureMessages.join('\n')),
          }).toMatchObject({
            statuses: ['failed', 'failed'],
            messages: [expect.stringContaining('LeakedState'), expect.stringContaining('LeakedState')],
          })
        }),
      ),
    )

    scenario(
      'a bare test that only passes once is reported as leaked state',
      Gherkin.Do.pipe(
        Given('a bare test whose body advances a module-level counter, beside an asserting one')(
          'report',
          () => runFixtures(['runner/bare-it.test.ts']),
        ),
        Then('the counter test is leaked state and the asserting one passes')((s, expect) => {
          const counter = 'Should_FailTheSecondRun_When_ItsBodyAdvancesACounter'
          return expect({
            counter: { status: assertionOf(s.report, counter).status, message: messagesOf(s.report, counter) },
            bare: assertionOf(s.report, 'Should_PassTheBareLane_When_ItsBodyAsserts').status,
          }).toMatchObject({
            counter: { status: 'failed', message: expect.stringContaining('LeakedState') },
            bare: 'passed',
          })
        }),
      ),
    )

    scenario(
      'a bare test that skips the fork defaults is refused with its rewrite',
      Gherkin.Do.pipe(
        Given('bare bodies that assert nothing, return a promise, and return an Effect')(
          'report',
          () => runFixtures(['runner/bare-it.test.ts']),
        ),
        Then('each body is refused with the rewrite that replaces it')((s, expect) =>
          expect({
            noCheck: messagesOf(s.report, 'Should_FailTheGate_When_ItsBodyCountsNoForkedCheck'),
            promiseBody: messagesOf(s.report, 'Should_RefuseTheAsyncBody_When_ItsBodyReturnsAPromise'),
            effectBody: messagesOf(s.report, 'Should_RefuseTheReturnedEffect_When_ItsBodyReturnsOne'),
          }).toMatchObject({
            noCheck: expect.stringContaining(refusal.noCheck),
            promiseBody: expect.stringContaining(refusal.syncBody),
            effectBody: expect.stringContaining(refusal.syncBody),
          })
        ),
      ),
    )

    scenario(
      'a plain describe block runs its tests concurrently',
      Gherkin.Do.pipe(
        Given('two tests in a plain describe that each wait for the other to arrive')(
          'report',
          () => runFixtures(['runner/describe-concurrency.test.ts']),
        ),
        Then('both tests rendezvous, so neither waited for the other to finish first')((s, expect) => {
          const file = fileOf(s.report, 'runner/describe-concurrency.test.ts')
          return expect({ status: file.status, statuses: statusesOf(file) }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed'],
          })
        }),
      ),
    )

    scenario(
      'a named layer block shuffles its tests by default',
      Gherkin.Do.pipe(
        Given('a named block that runs its tests one at a time, under a fixed seed')(
          'report',
          () => runProbes({ globs: ['runner/layer-shuffle.test.ts'], seed: 2 }).pipe(Effect.map((run) => run.report)),
        ),
        Then('each test runs in its seeded slot, not in the order it was declared')((s, expect) => {
          const file = fileOf(s.report, 'runner/layer-shuffle.test.ts')
          return expect({ status: file.status, statuses: statusesOf(file) }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed', 'passed'],
          })
        }),
      ),
    )
  })
