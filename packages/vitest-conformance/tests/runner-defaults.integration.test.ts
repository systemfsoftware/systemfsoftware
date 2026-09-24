import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { refuseAsync, refuseBareEffect, refuseNoAssertion } from '@systemfsoftware/vitest/refusals'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import { assertionOf, fileOf, type JsonReport, messagesOf, runFixtures, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const reportHas = (report: JsonReport, fullName: string): void => {
  expect(report.testResults.flatMap((file) => file.assertionResults.map((assertion) => assertion.fullName))).toContain(
    fullName,
  )
}

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
        Then('each test passes and each run saw the empty store')((s) => {
          expect(s.file.status).toBe('passed')
          expect(s.file.assertionResults).toHaveLength(2)
          reportHas(s.report, 'layer store isolation Should_SeeAnEmptyStore_When_RunningTestAlreadyWrote')
          reportHas(s.report, 'layer store isolation Should_SeeAnEmptyStore_When_AnotherTestWroteFirst')
          expect(
            assertionOf(s.report, 'layer store isolation Should_SeeAnEmptyStore_When_AnotherTestWroteFirst').status,
          ).toBe('passed')
        }),
      ),
    )

    scenario(
      'a shared layer block shares one build across its tests',
      Gherkin.Do.pipe(
        Given('the same block declared with shared: true')(
          'report',
          () => runFixtures(['runner/shared-layers.test.ts']),
        ),
        Then('the second test sees the first test write')((s) => {
          const file = fileOf(s.report, 'runner/shared-layers.test.ts')
          expect(file.status).toBe('passed')
          expect(file.assertionResults).toHaveLength(2)
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
        Then('the nested tests share the outer build')((s) => {
          const file = fileOf(s.report, 'runner/nested-shared.test.ts')
          expect(file.status).toBe('passed')
          expect(file.assertionResults).toHaveLength(2)
          expect(
            assertionOf(s.report, 'nested inside shared nested block Should_SeeOuterState_When_NestedInsideShared')
              .status,
          ).toBe('passed')
          expect(
            assertionOf(s.report, 'nested inside shared nested block Should_KeepOuterBuild_When_ANestedTestAlreadyRan')
              .status,
          ).toBe('passed')
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
        Then('the report is LeakedState carrying the second run failure')((s) => {
          expect(s.assertion.status).toBe('failed')
          expect(messagesOf(s.report, 'Should_FailTheSecondRun_When_VisibleCounterAdvances')).toContain('LeakedState')
        }),
      ),
    )

    scenario(
      'a 3 second tie wakes the background sleeper before the test fiber',
      Gherkin.Do.pipe(
        Given('a background fiber shipping after 3 seconds and a test sleeping 3 seconds')(
          'report',
          () => runFixtures(['runner/clock.test.ts']),
        ),
        Then('the test reads Shipped at virtual 3000 ms')((s) => {
          expect(fileOf(s.report, 'runner/clock.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'a sleep that ends now returns without advancing time',
      Gherkin.Do.pipe(
        Given('a test sleeping zero')('report', () => runFixtures(['runner/sleep-zero.test.ts'])),
        Then('the clock still reads zero')((s) => {
          expect(fileOf(s.report, 'runner/sleep-zero.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'fractional millisecond schedules complete without throwing',
      Gherkin.Do.pipe(
        Given('a jittered 1 ms schedule')('report', () => runFixtures(['runner/jittered.test.ts'])),
        Then('the repeat completes')((s) => {
          expect(fileOf(s.report, 'runner/jittered.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'TestClock.adjust still releases a 3 second sleeper',
      Gherkin.Do.pipe(
        Given('a 3 second sleeper and an adjust of 3 seconds')(
          'report',
          () => runFixtures(['runner/adjust.test.ts']),
        ),
        Then('the sleeper is released')((s) => {
          expect(fileOf(s.report, 'runner/adjust.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'four interleaved concurrent tests fail with only their own failures',
      Gherkin.Do.pipe(
        Given('four concurrent tests each failing distinctly')(
          'report',
          () => runFixtures(['runner/concurrency.test.ts']),
        ),
        Then('each failure message names only its own test')((s) => {
          const first = messagesOf(
            s.report,
            'interleaved concurrent failures Should_ReportOnlyItsFailure_When_FirstTestFails',
          )
          expect(first).toContain('first-marker')
          expect(first).not.toContain('second-marker')
          expect(first).not.toContain('third-marker')
          expect(first).not.toContain('fourth-marker')
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
        Then('the seed is reported and the replay matches')((s) => {
          expect(s.first.initial.seed).toBe(s.first.replayed.seed)
          const orderOf = (report: JsonReport): ReadonlyArray<string> =>
            report.testResults.flatMap((file) => file.assertionResults.map((assertion) => assertion.fullName))
          expect(orderOf(s.first.replayed.report)).toEqual(orderOf(s.first.initial.report))
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
        Then('type-checking passes and the sleeper is released')((s) => {
          expect(fileOf(s.report, 'v3-testclock/adjust.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'every row of a table is a test of its own',
      Gherkin.Do.pipe(
        Given('a table whose rows advance a module-level counter')(
          'report',
          () => runFixtures(['runner/each.test.ts']),
        ),
        Then('every row is reported as leaked state')((s) => {
          const rows = fileOf(s.report, 'runner/each.test.ts').assertionResults
          expect(rows).toHaveLength(2)
          expect(rows.filter((row) => row.status === 'failed')).toHaveLength(2)
          expect(messagesOf(s.report, 'Should_FailTheSecondRun_When_ARowAdvancesACounter')).toContain('LeakedState')
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
        Then('the counter test is leaked state and the asserting one passes')((s) => {
          expect(
            assertionOf(s.report, 'Should_FailTheSecondRun_When_ItsBodyAdvancesACounter').status,
          ).toBe('failed')
          expect(messagesOf(s.report, 'Should_FailTheSecondRun_When_ItsBodyAdvancesACounter')).toContain('LeakedState')
          expect(assertionOf(s.report, 'Should_PassTheBareLane_When_ItsBodyAsserts').status).toBe('passed')
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
        Then('each body is refused with the rewrite that replaces it')((s) => {
          expect(messagesOf(s.report, 'Should_FailTheGate_When_ItsBodyCountsNoForkedCheck')).toContain(
            refuseNoAssertion,
          )
          expect(messagesOf(s.report, 'Should_RefuseTheAsyncBody_When_ItsBodyReturnsAPromise')).toContain(refuseAsync)
          expect(messagesOf(s.report, 'Should_RefuseTheReturnedEffect_When_ItsBodyReturnsOne')).toContain(
            refuseBareEffect,
          )
        }),
      ),
    )

    scenario(
      'a plain describe block runs its tests concurrently',
      Gherkin.Do.pipe(
        Given('two tests in a plain describe that each wait for the other to arrive')(
          'report',
          () => runFixtures(['runner/describe-concurrency.test.ts']),
        ),
        Then('both tests rendezvous, so neither waited for the other to finish first')((s) => {
          const file = fileOf(s.report, 'runner/describe-concurrency.test.ts')
          expect(file.status).toBe('passed')
          expect(file.assertionResults.map((assertion) => assertion.status)).toEqual(['passed', 'passed'])
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
        Then('each test runs in its seeded slot, not in the order it was declared')((s) => {
          const file = fileOf(s.report, 'runner/layer-shuffle.test.ts')
          expect(file.status).toBe('passed')
          expect(file.assertionResults.map((assertion) => assertion.status)).toEqual([
            'passed',
            'passed',
            'passed',
          ])
        }),
      ),
    )
  })
