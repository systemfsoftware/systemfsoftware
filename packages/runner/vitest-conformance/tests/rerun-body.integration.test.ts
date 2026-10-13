import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
import { assertionOf, messagesOf, type ProbeRun, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const PROBE = 'runner/rerun-body.runner.test.ts'

const linesOf = (run: ProbeRun, body: string): number =>
  run.console.filter((line) => line.content.trim() === `rerun-body: ${body}`).length

Feature('The body a clean test runs a second time')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'a test registered without a rerun body runs its own body twice',
      Gherkin.Do.pipe(
        Given('a passing test registered with no rerun body')('run', () => runProbes({ globs: [PROBE] })),
        Then('its body ran twice and the test passed')((s, expect) =>
          expect({
            status: assertionOf(s.run.report, 'Should_RunTheRegisteredBodyTwice_When_NoRerunBodyIsGiven').status,
            runs: linesOf(s.run, 'default'),
          }).toEqual({ status: 'passed', runs: 2 })
        ),
      ),
    )

    scenario(
      'a test registered with a rerun body runs it in place of its own body the second time',
      Gherkin.Do.pipe(
        Given('a passing test registered with a rerun body')('run', () => runProbes({ globs: [PROBE] })),
        Then('the registered body ran once, the rerun body once, and the test passed')((s, expect) =>
          expect({
            status: assertionOf(s.run.report, 'Should_RunTheRerunBodySecond_When_TheRegistrationNamesOne').status,
            registered: linesOf(s.run, 'registered'),
            rerun: linesOf(s.run, 'rerun'),
          }).toEqual({ status: 'passed', registered: 1, rerun: 1 })
        ),
      ),
    )

    scenario(
      'a rerun body that fails reports the test as LeakedState',
      Gherkin.Do.pipe(
        Given('a test whose rerun body fails after its own body passed')('run', () => runProbes({ globs: [PROBE] })),
        Then('the test fails as LeakedState carrying the rerun body failure')((s, expect) =>
          expect({
            status: assertionOf(s.run.report, 'Should_FailAsLeakedState_When_TheRerunBodyFails').status,
            message: messagesOf(s.run.report, 'Should_FailAsLeakedState_When_TheRerunBodyFails'),
          }).toMatchObject({
            status: 'failed',
            message: expect.stringMatching(/LeakedState[\s\S]*passes first/u),
          })
        ),
      ),
    )
  })
