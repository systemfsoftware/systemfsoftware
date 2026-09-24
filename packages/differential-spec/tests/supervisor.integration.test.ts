import { assert, expect } from '@effect/vitest'
import { runDifferentialWithShrink, runDual } from '@systemfsoftware/differential-spec'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit, Layer } from 'effect'
import { integers } from './__fixtures__/arbitraries.js'
import { CandidateDefect } from './__fixtures__/CandidateDefect.schema.js'
import { disparityReportOf } from './__fixtures__/disparityReport.js'

const Feature = makeFeature({ it, layer })

Feature('Proving two implementations agree without a hardcoded expected value')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A candidate matching the reference produces two successful outcomes',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both double their input')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.succeed(x * 2),
              candidate: (x: number) => Effect.succeed(x + x),
            }),
        ),
        When('both implementations run on the input five')(
          'outcomes',
          (s) => runDual(s.targets.reference, s.targets.candidate, 5, 5),
        ),
        Then('each side succeeds with the doubled value')((s) => {
          const [referenceOutcome, candidateOutcome] = s.outcomes
          assert(Exit.isSuccess(referenceOutcome), 'reference outcome should succeed')
          assert(Exit.isSuccess(candidateOutcome), 'candidate outcome should succeed')
          expect(referenceOutcome.value).toBe(10)
          expect(candidateOutcome.value).toBe(10)
        }),
      ),
    )

    scenario(
      'A crashing candidate is captured as a failure while the reference still succeeds',
      Gherkin.Do.pipe(
        Given('a healthy reference and a candidate that always crashes')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.succeed(x * 2),
              candidate: (_x: number) => Effect.fail(new CandidateDefect()),
            }),
        ),
        When('both implementations run on the input five')(
          'outcomes',
          (s) => runDual(s.targets.reference, s.targets.candidate, 5, 5),
        ),
        Then('the reference succeeds and the candidate outcome records the crash')((s) => {
          const [referenceOutcome, candidateOutcome] = s.outcomes
          assert(Exit.isSuccess(referenceOutcome), 'reference outcome should succeed')
          assert(Exit.isFailure(candidateOutcome), 'candidate outcome should fail')
        }),
      ),
    )

    scenario(
      'A diverging candidate is reduced to the smallest failing input in the report',
      Gherkin.Do.pipe(
        Given('a candidate that is always one more than the reference')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.succeed(x * 2),
              candidate: (x: number) => Effect.succeed(x * 2 + 1),
            }),
        ),
        When('the parity check runs over generated integers')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
          )),
        Then('the report names zero as the minimal input with both sides shown')((s) => {
          const report = disparityReportOf(s.outcome)
          expect(report).toContain('Input: 0')
          expect(report).toContain('Output A: 0')
          expect(report).toContain('Output B: 1')
          expect(report).toContain('seed')
        }),
      ),
    )

    scenario(
      'Two implementations that refuse the same inputs the same way still agree',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both refuse negative amounts')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => (x < 0 ? Effect.fail(new CandidateDefect()) : Effect.succeed(x * 2)),
              candidate: (x: number) => (x < 0 ? Effect.fail(new CandidateDefect()) : Effect.succeed(x + x)),
            }),
        ),
        When('the parity check runs over generated integers')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
          )),
        Then('the run completes without complaint')((s) => {
          expect(s.outcome).toSatisfy(Exit.isSuccess)
        }),
      ),
    )
    scenario(
      'A parity check cut short by its time budget is reported instead of silently passing',
      Gherkin.Do.pipe(
        Given('two agreeing implementations and a run budget far larger than the time limit')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.succeed(x * 2),
              candidate: (x: number) => Effect.succeed(x + x),
              options: { runBudget: 1_000_000_000, interruptAfterTimeLimit: 50 },
            }),
        ),
        When('the parity check runs until the clock stops it')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(
              s.targets.reference,
              s.targets.candidate,
              integers,
              (a, b) => a === b,
              s.targets.options,
            ),
          )),
        Then('the failure is reported as inconclusive with the interrupt marked')((s) => {
          const report = disparityReportOf(s.outcome)
          expect(report).toContain('inconclusive')
          expect(report).toContain('interrupted true')
        }),
      ),
    )

    scenario(
      'Two implementations that settle through promises still agree',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both settle their doubling through a promise')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.promise(() => Promise.resolve(x * 2)),
              candidate: (x: number) => Effect.promise(() => Promise.resolve(x + x)),
            }),
        ),
        When('the parity check runs over generated integers')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
          )),
        Then('the asynchronous run completes without complaint')((s) => {
          expect(s.outcome).toSatisfy(Exit.isSuccess)
        }),
      ),
    )

    scenario(
      'An asynchronous candidate that is always one more is reduced to the smallest failing input',
      Gherkin.Do.pipe(
        Given('a candidate that settles one more than the reference through a promise')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) => Effect.promise(() => Promise.resolve(x * 2)),
              candidate: (x: number) => Effect.promise(() => Promise.resolve(x * 2 + 1)),
            }),
        ),
        When('the parity check runs over generated integers')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
          )),
        Then('the report names zero as the minimal input with both sides shown')((s) => {
          const report = disparityReportOf(s.outcome)
          expect(report).toContain('Input: 0')
          expect(report).toContain('Output A: 0')
          expect(report).toContain('Output B: 1')
          expect(report).toContain('seed')
        }),
      ),
    )

    scenario(
      'Targets that pause on a sleep before settling are compared like any other',
      Gherkin.Do.pipe(
        Given('a reference and a candidate that both pause briefly before settling their doubling')(
          'targets',
          () =>
            Effect.succeed({
              reference: (x: number) =>
                Effect.gen(function*() {
                  yield* Effect.sleep('1 millis')
                  return yield* Effect.promise(() => Promise.resolve(x * 2))
                }),
              candidate: (x: number) =>
                Effect.gen(function*() {
                  yield* Effect.sleep('1 millis')
                  return yield* Effect.promise(() => Promise.resolve(x + x))
                }),
            }),
        ),
        When('the parity check runs over generated integers')('outcome', (s) =>
          Effect.exit(
            runDifferentialWithShrink(s.targets.reference, s.targets.candidate, integers, (a, b) => a === b),
          )),
        Then('the deferred run completes without complaint')((s) => {
          expect(s.outcome).toSatisfy(Exit.isSuccess)
        }),
      ),
    )
  })
