import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import {
  presenceMessage,
  refuseAsync,
  refuseHook,
  refuseNoAssertion,
  refuseUnprovided,
} from '@systemfsoftware/vitest/refusals'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import { assertionOf, fileOf, type JsonReport, messagesOf, runFixtures } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const expectSuiteFailed = (report: JsonReport, stem: string): void => {
  expect(fileOf(report, stem).status).toBe('failed')
}

Feature('Fork expect surface')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'two failing checks in one step are both reported and the side effect never runs',
      Gherkin.Do.pipe(
        Given('two failed checks followed by a write')(
          'report',
          () => runFixtures(['expect/soft-step.test.ts']),
        ),
        Then('both failures are reported and the write after them never runs')((s) => {
          expectSuiteFailed(s.report, 'expect/soft-step.test.ts')
          const messages = messagesOf(s.report, 'Should_ReportBothFailures_When_TwoChecksFailInOneStep')
          expect(messages).toContain('expected 1 to deeply equal 3')
          expect(messages).toContain('expected 2 to deeply equal 4')
          expect(messages).not.toContain('SIDE EFFECT RAN')
        }),
      ),
    )

    scenario(
      'a forked child performing the side effect is interrupted too',
      Gherkin.Do.pipe(
        Given('a child fiber holding the write behind a sleep')(
          'report',
          () => runFixtures(['expect/forked-fiber.test.ts']),
        ),
        Then('the write never lands')((s) => {
          expectSuiteFailed(s.report, 'expect/forked-fiber.test.ts')
          const messages = messagesOf(s.report, 'Should_InterruptTheChild_When_CheckFailsFirst')
          expect(messages).toContain('expected 1 to deeply equal 3')
          expect(messages).not.toContain('SIDE EFFECT RAN')
        }),
      ),
    )

    scenario(
      'a throw after a failed check is reported as AfterFailedExpect',
      Gherkin.Do.pipe(
        Given('a failed check whose cleanup then throws')(
          'report',
          () => runFixtures(['expect/after-failed.test.ts']),
        ),
        Then('the report names AfterFailedExpect beside the check, and nothing else')((s) => {
          expectSuiteFailed(s.report, 'expect/after-failed.test.ts')
          const assertion = assertionOf(s.report, 'Should_ReportAfterFailedExpect_When_ThrowFollowsAFailedCheck')
          expect(assertion.failureMessages).toHaveLength(2)
          expect(assertion.failureMessages.join('\n')).toContain('AfterFailedExpect')
        }),
      ),
    )

    scenario(
      'a failed check that throws nothing is not relabelled',
      Gherkin.Do.pipe(
        Given('a failed check with nothing thrown after it')(
          'report',
          () => runFixtures(['expect/check-only.test.ts']),
        ),
        Then('the report carries the check alone, with no invented failure')((s) => {
          expectSuiteFailed(s.report, 'expect/check-only.test.ts')
          const assertion = assertionOf(s.report, 'Should_ReportOnlyTheCheck_When_NothingThrowsAfterAFailedCheck')
          expect(assertion.failureMessages).toHaveLength(1)
          expect(assertion.failureMessages.join('\n')).not.toContain('AfterFailedExpect')
        }),
      ),
    )

    scenario(
      'a property false verdict still shrinks to the boundary',
      Gherkin.Do.pipe(
        Given('a property failing past 100')('report', () => runFixtures(['expect/shrink.property.test.ts'])),
        Then('the counterexample is the boundary value')((s) => {
          expectSuiteFailed(s.report, 'expect/shrink.property.test.ts')
          expect(messagesOf(s.report, '∀n_ShrinkToTheBoundary_=Boundary')).toContain('100')
        }),
      ),
    )

    scenario(
      'a property whose own check fails softly still shrinks to the boundary',
      Gherkin.Do.pipe(
        Given('a property that checks its input softly before returning its verdict')(
          'report',
          () => runFixtures(['property/soft-check-shrink.property.test.ts']),
        ),
        Then('the counterexample is the boundary value')((s) => {
          expectSuiteFailed(s.report, 'property/soft-check-shrink.property.test.ts')
          expect(messagesOf(s.report, '∀n_ShrinkToTheBoundary_=Boundary')).toContain('Shrunk input: [100]')
        }),
      ),
    )

    scenario(
      'a refusal on the second run is reported as that refusal, not as leaked state',
      Gherkin.Do.pipe(
        Given('a test that only trips a narrowed check once it runs a second time')(
          'report',
          () => runFixtures(['expect/refusal-on-second-run.test.ts']),
        ),
        Then('the report names the narrowed matcher')((s) => {
          expectSuiteFailed(s.report, 'expect/refusal-on-second-run.test.ts')
          const messages = messagesOf(s.report, 'Should_ReportTheNarrowedRefusal_When_TheSecondRunTripsIt')
          expect(messages).toContain(presenceMessage('toBeDefined'))
          expect(messages).not.toContain('LeakedState')
        }),
      ),
    )

    scenario(
      'toEqual compares with Effect Equal across references',
      Gherkin.Do.pipe(
        Given('two Money values sharing a cents value')('report', () => runFixtures(['expect/equal.test.ts'])),
        Then('the check passes')((s) => {
          expect(
            assertionOf(s.report, 'Should_PassToEqual_When_TwoMoneyShareACentsValue').status,
          ).toBe('passed')
        }),
      ),
    )

    scenario(
      'narrowed presence matchers fail with the rewrite message',
      Gherkin.Do.pipe(
        Given('the five narrowed forms')('report', () => runFixtures(['expect/narrowed.test.ts'])),
        Then('each failure states the rewrite')((s) => {
          expectSuiteFailed(s.report, 'expect/narrowed.test.ts')
          expect(messagesOf(s.report, 'narrowed refusals Should_RefuseToBeDefined_When_PresenceCheckRuns')).toContain(
            presenceMessage('toBeDefined'),
          )
          expect(messagesOf(s.report, 'narrowed refusals Should_RefuseToBeTruthy_When_PresenceCheckRuns')).toContain(
            presenceMessage('toBeTruthy'),
          )
          expect(messagesOf(s.report, 'narrowed refusals Should_RefuseToBeFalsy_When_PresenceCheckRuns')).toContain(
            presenceMessage('toBeFalsy'),
          )
          expect(messagesOf(s.report, 'narrowed refusals Should_RefuseNotToBeNull_When_NegatedPresenceCheckRuns'))
            .toContain(
              presenceMessage('toBeNull'),
            )
          expect(messagesOf(s.report, 'narrowed refusals Should_RefuseNotToBeUndefined_When_NegatedPresenceCheckRuns'))
            .toContain(
              presenceMessage('toBeUndefined'),
            )
        }),
      ),
    )

    scenario(
      'per-test hooks fail with the hooks rewrite',
      Gherkin.Do.pipe(
        Given('beforeEach and afterEach in a block')('report', () => runFixtures(['expect/hooks.test.ts'])),
        Then('the report carries the hooks message')((s) => {
          expectSuiteFailed(s.report, 'expect/hooks.test.ts')
          expect(fileOf(s.report, 'expect/hooks.test.ts').message).toContain(refuseHook)
        }),
      ),
    )

    scenario(
      'an async test body fails with the async rewrite',
      Gherkin.Do.pipe(
        Given('a body returning a promise')('report', () => runFixtures(['expect/async-body.test.ts'])),
        Then('the report carries the async message')((s) => {
          expect(messagesOf(s.report, 'Should_RefuseTheAsyncBody_When_BodyReturnsAPromise')).toContain(refuseAsync)
        }),
      ),
    )

    scenario(
      'a body needing a service nothing provides fails with the unprovided rewrite',
      Gherkin.Do.pipe(
        Given('a body reading a missing service')('report', () => runFixtures(['expect/unprovided.test.ts'])),
        Then('the report carries the unprovided message')((s) => {
          expect(messagesOf(s.report, 'Should_RefuseTheUnprovidedBody_When_ServiceIsMissing')).toContain(
            refuseUnprovided,
          )
        }),
      ),
    )

    scenario(
      'toBe on objects and type matchers stay legal',
      Gherkin.Do.pipe(
        Given('identity and type claims')('report', () => runFixtures(['expect/allowed.test.ts'])),
        Then('the file passes')((s) => {
          expect(fileOf(s.report, 'expect/allowed.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'a failing expect inside owned throws into the enclosing Effect cause',
      Gherkin.Do.pipe(
        Given('an owned failing check observed through Effect.exit')(
          'report',
          () => runFixtures(['expect/owned.test.ts']),
        ),
        Then('the outer test passes on the observed cause')((s) => {
          expect(fileOf(s.report, 'expect/owned.test.ts').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'recordAssertion counts as an assertion and silence fails the gate',
      Gherkin.Do.pipe(
        Given('a recording check and a silent body')('report', () => runFixtures(['expect/assertion-gate.test.ts'])),
        Then('the recorder passes and the silent test names the gate')((s) => {
          expect(
            assertionOf(s.report, 'no-assertion gate Should_PassTheGate_When_RecordAssertionCountsTheCheck').status,
          ).toBe('passed')
          expect(messagesOf(s.report, 'no-assertion gate Should_FailTheGate_When_NoAssertionRuns')).toContain(
            refuseNoAssertion,
          )
        }),
      ),
    )

    scenario(
      'a silent concurrent test fails the gate on its own count',
      Gherkin.Do.pipe(
        Given('a recording test and a silent test that waits for it')(
          'report',
          () => runFixtures(['expect/concurrent-gate.test.ts']),
        ),
        When('the block runs its two tests together')(
          'report',
          (s) => Effect.succeed(s.report),
        ),
        Then('the recording test passes and only the silent test names the gate')((s) => {
          expect(
            assertionOf(s.report, 'concurrent no-assertion gate Should_PassTheGate_When_ItsOwnRecordCounts').status,
          ).toBe('passed')
          expect(
            messagesOf(s.report, 'concurrent no-assertion gate Should_FailTheGate_When_OnlyASiblingRecorded'),
          ).toContain(refuseNoAssertion)
        }),
      ),
    )
  })
