import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Check, Expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import { assertionOf, fileOf, type JsonReport, messagesOf, runFixtures, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const refusal = {
  unyielded:
    '✗ a check was written but never yielded, so it never ran. Yield it: yield* expect(actual).toEqual(expected).',
  noCheck:
    "✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.",
  oneState:
    '✗ a second check on the same state. Checking a state piece by piece reports one field at a time and misses the ones never checked. Assert the state once: yield* expect(order).toMatchObject({ id: 1, status: "Pending" }), or gather what you observed: yield* expect({ total, status }).toEqual({ total: Money.of(4.4), status: "Pending" }). A check inside a loop is the same: assert the whole array once. Several inputs: it.each(rows)(name, function* (row, { expect }) { ... }).',
  syncBody:
    '✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
  effectLane:
    '✗ it.effect is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
  scopedLane:
    '✗ it.scoped is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
  scopedLiveLane:
    '✗ it.scopedLive is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
  hook:
    '✗ hooks share state between tests. Build what a test needs inside it; services come fresh per test from layer(Service.layer)((it) => { ... }).',
  rawExpect:
    '✗ an expect imported from vitest ran; take it from the test callback: it(name, function* ({ expect }) { ... })',
  foreignIt: "✗ this test was registered with vitest's it; import it from @systemfsoftware/vitest",
  toHaveLength:
    '✗ toHaveLength checks how many, not which. Assert the contents: toEqual([...]); only some of them: toEqual(expect.arrayContaining([...])).',
  toBeDefined:
    '✗ toBeDefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeTypeOf:
    '✗ toBeTypeOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).',
  toHaveProperty:
    '✗ toHaveProperty checks one key at a time. Assert the shape once: toMatchObject({ key: value, ... }).',
  notToBeNull:
    '✗ not.toBeNull passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toThrow:
    '✗ toThrow() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
  toSatisfy:
    '✗ toSatisfy(predicate) fails with \'expected x to satisfy [Function]\'. Say what must hold: toSatisfy(predicate, "every line has a positive quantity").',
  emptyMatchObject:
    '✗ toMatchObject({}) matches every object. Name the fields that must hold: toMatchObject({ status: "Pending" }).',
  booleanActual:
    '✗ expect(<boolean>) can only report \'expected false to be true\'. Pass the two values instead: yield* expect(a).toEqual(b), which uses Effect Equal. A predicate: yield* expect(value).toSatisfy(predicate, "what must hold").',
  anything:
    '✗ expect.anything() matches every value. Say what the value must be: expect.any(Money), expect.objectContaining({ ... }), expect.schemaMatching(Schema).',
  poll:
    '✗ expect.poll waits on the real clock, outside the runner\'s virtual time. Let time pass inside the test: yield* TestClock.adjust("3 seconds"); then yield* expect(value).toEqual(expected).',
  soft:
    '✗ expect.soft reports several failures on one state; the fork reports the state once. Assert the state once: yield* expect(actual).toEqual(expected).',
} as const

type RefusedCase = readonly [name: string, text: string]

const refusedSuiteCheck = (
  expect: Expect,
  report: JsonReport,
  stem: string,
  cases: ReadonlyArray<RefusedCase>,
): Check =>
  expect({
    suite: fileOf(report, stem).status,
    ...Object.fromEntries(
      cases.map(([name]) => [name, { status: assertionOf(report, name).status, message: messagesOf(report, name) }]),
    ),
  }).toMatchObject({
    suite: 'failed',
    ...Object.fromEntries(
      cases.map(([name, text]) => [name, { status: 'failed', message: expect.stringContaining(text) }]),
    ),
  })

const refusedFileCheck = (expect: Expect, report: JsonReport, stem: string, text: string): Check =>
  expect({ suite: fileOf(report, stem).status, message: fileOf(report, stem).message }).toMatchObject({
    suite: 'failed',
    message: expect.stringContaining(text),
  })

Feature('Fork expect surface')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A check the runner never judges is refused',
      Gherkin.Do.pipe(
        Given('a test that writes a check and never hands it over, beside a test that observes nothing')(
          'fixtures',
          () => Effect.succeed(['expect/yielded.test.ts']),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('each is refused for the check the runner did not judge')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/yielded.test.ts', [
            [
              'yielded checks Should_RefuseTheUnyieldedCheck_When_CheckIsWrittenButNotYielded',
              refusal.unyielded,
            ],
            ['yielded checks Should_RefuseTheBody_When_ItYieldsNoCheck', refusal.noCheck],
          ])
        ),
      ),
    )

    scenario(
      'A second look at one observation is refused, a step between them is not',
      Gherkin.Do.pipe(
        Given(
          'a test that looks twice, a test that lets the clock move between looks, and a test that looks once per row',
        )(
          'fixtures',
          () => Effect.succeed(['expect/one-state.test.ts']),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('the second look and the per-row looks are refused, and the clock-separated one passes')((s, expect) => {
          const second = 'one check per observed state Should_RefuseTheSecondCheck_When_TwoChecksObserveOneState'
          const separated = 'one check per observed state Should_AcceptTheSecondCheck_When_StepSeparatesStates'
          const loop =
            'one check per observed state Should_RefuseTheCheckInALoop_When_EachItemOfTheSameStateChecksItself'
          return expect({
            suite: fileOf(s.report, 'expect/one-state.test.ts').status,
            second: { status: assertionOf(s.report, second).status, message: messagesOf(s.report, second) },
            separated: { status: assertionOf(s.report, separated).status },
            loop: { status: assertionOf(s.report, loop).status, message: messagesOf(s.report, loop) },
          }).toMatchObject({
            suite: 'failed',
            second: { status: 'failed', message: expect.stringContaining(refusal.oneState) },
            separated: { status: 'passed' },
            loop: { status: 'failed', message: expect.stringContaining(refusal.oneState) },
          })
        }),
      ),
    )

    scenario(
      'A weak claim is refused with the rewrite that replaces it',
      Gherkin.Do.pipe(
        Given(
          'tests claiming how many items there are, that one is present, what kind of value it is, one key, and that it is not null',
        )(
          'fixtures',
          () => Effect.succeed(['expect/vocabulary.test.ts']),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('each is refused by name with its rewrite')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/vocabulary.test.ts', [
            ['the curated vocabulary Should_RefuseToHaveLength_When_TheClaimIsHowMany', refusal.toHaveLength],
            ['the curated vocabulary Should_RefuseToBeDefined_When_TheClaimIsPresence', refusal.toBeDefined],
            ['the curated vocabulary Should_RefuseToBeTypeOf_When_TheClaimIsTheKindOfValue', refusal.toBeTypeOf],
            ['the curated vocabulary Should_RefuseToHaveProperty_When_TheClaimIsOneKey', refusal.toHaveProperty],
            ['the curated vocabulary Should_RefuseNotToBeNull_When_TheClaimIsANegatedPresence', refusal.notToBeNull],
          ])
        ),
      ),
    )

    scenario(
      'A claim that needs its subject named is refused',
      Gherkin.Do.pipe(
        Given(
          'tests claiming that something throws, that a predicate holds, and that a shape matches, each with nothing said',
        )(
          'fixtures',
          () => Effect.succeed(['expect/needs-argument.test.ts']),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('each is refused with the specific argument it is missing')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/needs-argument.test.ts', [
            ['matchers that need their specific argument Should_RefuseToThrow_When_NoErrorIsNamed', refusal.toThrow],
            [
              'matchers that need their specific argument Should_RefuseToSatisfy_When_NoReasonIsGiven',
              refusal.toSatisfy,
            ],
            [
              'matchers that need their specific argument Should_RefuseAnEmptyMatchObject_When_NoFieldIsNamed',
              refusal.emptyMatchObject,
            ],
          ])
        ),
      ),
    )

    scenario(
      'A claim about a true-or-false value is refused',
      Gherkin.Do.pipe(
        Given('a test claiming that a comparison is true')(
          'fixtures',
          () => Effect.succeed(['expect/boolean-actual.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('it is refused with the two values to pass instead')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/boolean-actual.test.ts', [
            [
              'a boolean actual Should_RefuseTheBooleanActual_When_TheCheckCanOnlyReportTrue',
              refusal.booleanActual,
            ],
          ])
        ),
      ),
    )

    scenario(
      'One allowed claim counts as the check, and its failure stops the test',
      Gherkin.Do.pipe(
        Given('a test whose only claim passes and a test whose claim fails before a write')(
          'fixtures',
          () => Effect.succeed(['expect/kept-matcher.test.ts']),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('the passing claim satisfies the check gate and the failing one stops the write')((s, expect) => {
          const kept = 'a kept matcher Should_CountTheCheck_When_TheKeptMatcherPasses'
          const stopped = 'a kept matcher Should_StopTheTest_When_TheKeptMatcherFails'
          const messages = messagesOf(s.report, stopped)
          return expect({
            suite: fileOf(s.report, 'expect/kept-matcher.test.ts').status,
            kept: { status: assertionOf(s.report, kept).status },
            stopped: { status: assertionOf(s.report, stopped).status, message: messages },
            afterFailure: messages,
          }).toMatchObject({
            suite: 'failed',
            kept: { status: 'passed' },
            stopped: { status: 'failed', message: expect.stringContaining('deeply equal') },
            afterFailure: expect.not.stringContaining('SIDE EFFECT RAN'),
          })
        }),
      ),
    )

    scenario(
      'A table of rows is judged once per row',
      Gherkin.Do.pipe(
        Given('one test over two rows of input')(
          'fixtures',
          () => Effect.succeed(['expect/each.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('each row is judged once and the file passes')((s, expect) => {
          const file = fileOf(s.report, 'expect/each.test.ts')
          return expect({
            status: file.status,
            statuses: file.assertionResults.map((row) => row.status),
            names: file.assertionResults.map((row) => row.fullName).sort(),
          }).toMatchObject({
            status: 'passed',
            statuses: ['passed', 'passed'],
            names: [
              'it.each judges each row once Should_JudgeTheRow_When_OneApple',
              'it.each judges each row once Should_JudgeTheRow_When_TwoApples',
            ],
          })
        }),
      ),
    )

    scenario(
      'A check made in a background task still fails the test',
      Gherkin.Do.pipe(
        Given('a test that hands a failing check to a background task and waits for it')(
          'fixtures',
          () => Effect.succeed(['expect/forked-fiber.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('the test fails with the check diff')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/forked-fiber.test.ts', [
            ['a check in a forked fiber Should_FailTheTest_When_ChildFiberCheckFails', 'expected 1 to deeply equal 2'],
          ])
        ),
      ),
    )

    scenario(
      'A failed check still runs the cleanup it was written inside',
      Gherkin.Do.pipe(
        Given(
          'a test whose failing check sits in a block that always runs, under a service layer that releases when the test ends',
        )(
          'run',
          () => runProbes({ globs: ['expect/finally.test.ts'] }),
        ),
        Then('the block and the release both ran, and the write after the check did not')((s, expect) =>
          expect({
            evidence: s.run.evidence.trim().split('\n'),
            statuses: s.run.report.testResults.map((file) => file.status),
          }).toEqual({ evidence: ['finally', 'release'], statuses: ['failed'] })
        ),
      ),
    )

    scenario(
      'A body that is not a generator is refused',
      Gherkin.Do.pipe(
        Given('a test whose body is a plain function')(
          'fixtures',
          () => Effect.succeed(['expect/sync-body.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('it is refused with the generator to write instead')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/sync-body.test.ts', [
            ['Should_RefuseTheSyncBody_When_BodyIsNotAGenerator', refusal.syncBody],
          ])
        ),
      ),
    )

    scenario(
      'A lane a test author reaches for by habit is refused by name',
      Gherkin.Do.pipe(
        Given('tests registered on the three lanes the library removed')(
          'fixtures',
          () =>
            Effect.succeed([
              'expect/habit.test.ts',
              'expect/habit-scoped.test.ts',
              'expect/habit-scoped-live.test.ts',
            ]),
        ),
        When('the suite runs those tests')('report', (s) => runFixtures(s.fixtures)),
        Then('each lane is refused, naming the lane that was called, with the generator body to write instead')(
          (s, expect) => {
            const fileAt = (stem: string) => ({
              status: fileOf(s.report, stem).status,
              message: fileOf(s.report, stem).message,
            })
            return expect({
              effect: fileAt('expect/habit.test.ts'),
              scoped: fileAt('expect/habit-scoped.test.ts'),
              scopedLive: fileAt('expect/habit-scoped-live.test.ts'),
            }).toMatchObject({
              effect: { status: 'failed', message: expect.stringContaining(refusal.effectLane) },
              scoped: { status: 'failed', message: expect.stringContaining(refusal.scopedLane) },
              scopedLive: { status: 'failed', message: expect.stringContaining(refusal.scopedLiveLane) },
            })
          },
        ),
      ),
    )

    scenario(
      'A refused helper is refused when it is read, not only when it is called',
      Gherkin.Do.pipe(
        Given('checks that read a refused helper but never call it')(
          'fixtures',
          () => Effect.succeed(['expect/statics.test.ts']),
        ),
        When('the suite runs those checks')('report', (s) => runFixtures(s.fixtures)),
        Then('each read is refused with the rewrite that replaces the helper')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/statics.test.ts', [
            [
              'the refused statics Should_RefuseTheAnythingStatic_When_ItIsReadButNotCalled',
              refusal.anything,
            ],
            ['the refused statics Should_RefuseThePollStatic_When_ItIsReadButNotCalled', refusal.poll],
            ['the refused statics Should_RefuseTheSoftStatic_When_ItIsReadButNotCalled', refusal.soft],
          ])
        ),
      ),
    )

    scenario(
      'A shared hook is refused',
      Gherkin.Do.pipe(
        Given('a suite that shares setup through a per-test hook')(
          'fixtures',
          () => Effect.succeed(['expect/hooks.test.ts']),
        ),
        When('the suite runs that suite')('report', (s) => runFixtures(s.fixtures)),
        Then('the suite refuses the hook with the fresh service layer to use instead')((s, expect) =>
          refusedFileCheck(expect, s.report, 'expect/hooks.test.ts', refusal.hook)
        ),
      ),
    )

    scenario(
      'An expect taken from the runner instead of the test callback is refused',
      Gherkin.Do.pipe(
        Given('a test that hands over a real check and also asserts through an expect it imported from the runner')(
          'fixtures',
          () => Effect.succeed(['expect/raw-vitest-expect.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('the imported expect is refused and the callback is named instead')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/raw-vitest-expect.test.ts', [
            [
              'an expect imported from vitest Should_RefuseTheRawExpect_When_AnImportedExpectRunsBesideARealCheck',
              refusal.rawExpect,
            ],
          ])
        ),
      ),
    )

    scenario(
      'A test registered by the runner itself is refused',
      Gherkin.Do.pipe(
        Given('a test registered by the runner rather than the library')(
          'fixtures',
          () => Effect.succeed(['expect/foreign-it.test.ts']),
        ),
        When('the suite runs that test')('report', (s) => runFixtures(s.fixtures)),
        Then('it is refused with the library to import the test from')((s, expect) =>
          refusedSuiteCheck(expect, s.report, 'expect/foreign-it.test.ts', [
            ['Should_RefuseTheForeignRegistration_When_VitestRegistersTheTest', refusal.foreignIt],
          ])
        ),
      ),
    )

    scenario(
      'A property that fails wide still shrinks to the boundary',
      Gherkin.Do.pipe(
        Given('a property that fails past a hundred')(
          'fixtures',
          () => Effect.succeed(['expect/shrink.property.test.ts']),
        ),
        When('the suite runs that property')('report', (s) => runFixtures(s.fixtures)),
        Then('the counterexample is the boundary value')((s, expect) =>
          expect({
            suite: fileOf(s.report, 'expect/shrink.property.test.ts').status,
            boundary: messagesOf(s.report, '∀n_ShrinkToTheBoundary_=Boundary'),
          }).toMatchObject({
            suite: 'failed',
            boundary: expect.stringContaining('100'),
          })
        ),
      ),
    )
  })
