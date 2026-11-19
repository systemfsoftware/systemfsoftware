import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Layer, Match } from 'effect'
import { checkThenSet, raceDetected } from './__fixtures__/searchFixtures.js'

const Feature = makeFeature({ it })

const orThrow = <A>(value: A | undefined, message: string): A => {
  if (value === undefined) throw new Error(message)
  return value
}

const failureOf = (result: Kernel.RunResult<ReadonlyArray<boolean>, never>) =>
  Match.value(result).pipe(
    Match.tag('Failed', (failed) => failed),
    Match.orElse(() => {
      throw new Error('expected a failed run')
    }),
  )

const traceOf = (result: Kernel.RunResult<ReadonlyArray<boolean>, never>) =>
  result.steps.map((step) => ({
    boundary: step.boundary,
    runnable: result.boundaries.find((boundary) => boundary.step === step.step)?.runnableFibers ?? [],
  }))

Feature('The kernel logs every yield boundary and fails a diverged replay closed')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Every yield boundary is logged, inline continuations included',
      Gherkin.Do.pipe(
        Given('the two-worker race program')('program', () => Effect.succeed(checkThenSet)),
        When('it runs on the kernel’s own order')(
          'facts',
          (s) =>
            Effect.promise(() =>
              Kernel.run(s.program, {}).then((result) => ({
                boundaryCount: result.boundaries.length,
                autoYieldCount: result.boundaries.filter((boundary) => boundary.kind === 'auto-yield').length,
                inlineCount: result.boundaries.filter(
                  (boundary) => boundary.chosenFiber === boundary.activeFiber && !boundary.preempted,
                ).length,
                chosenWereRunnable: result.boundaries.every((boundary) =>
                  boundary.runnableFibers.includes(boundary.chosenFiber)
                ),
              }))
            ),
        ),
        Then(
          'auto-yield boundaries appear, some continue the active fiber inline, and every chosen fiber was runnable',
        )(
          (s, expect) =>
            expect({
              hasBoundaries: s.facts.boundaryCount > 0,
              hasAutoYields: s.facts.autoYieldCount > 0,
              hasInlineContinuations: s.facts.inlineCount > 0,
              chosenWereRunnable: s.facts.chosenWereRunnable,
            }).toEqual({
              hasBoundaries: true,
              hasAutoYields: true,
              hasInlineContinuations: true,
              chosenWereRunnable: true,
            }),
        ),
      ),
    )

    scenario(
      'A deviation away from a still-runnable active fiber is marked preempted',
      Gherkin.Do.pipe(
        Given('the two-worker race program')('program', () => Effect.succeed(checkThenSet)),
        When('a one-pause search finds the race')(
          'facts',
          (s) =>
            Effect.promise(() =>
              Kernel.search(s.program, { preemptions: 1, isFailure: raceDetected, prune: false }).then((outcome) => {
                const failure = orThrow(outcome.failures[0], 'expected the race to be found')
                const preempted = orThrow(
                  failure.result.boundaries.find((boundary) => boundary.preempted),
                  'expected a preempted boundary in the failing schedule',
                )
                return {
                  chosenDiffersFromActive: preempted.chosenFiber !== preempted.activeFiber,
                  activeWasRunnable: preempted.runnableFibers.includes(preempted.activeFiber),
                }
              })
            ),
        ),
        Then('the failing schedule carries a boundary that switched away from the still-runnable active fiber')(
          (s, expect) =>
            expect({
              chosenDiffersFromActive: s.facts.chosenDiffersFromActive,
              activeWasRunnable: s.facts.activeWasRunnable,
            }).toEqual({
              chosenDiffersFromActive: true,
              activeWasRunnable: true,
            }),
        ),
      ),
    )

    scenario(
      'A replay whose recorded trace mismatches fails closed with ReplayTraceDiverged',
      Gherkin.Do.pipe(
        Given('the two-worker race program')('program', () => Effect.succeed(checkThenSet)),
        When('it replays against a corrupted recording of its own trace')(
          'facts',
          (s) =>
            Effect.promise(() =>
              Kernel.run(s.program, {}).then((first) => {
                const corrupted = traceOf(first).map((snapshot) => ({
                  boundary: snapshot.boundary,
                  runnable: [Number.MAX_SAFE_INTEGER],
                }))
                return Kernel.run(s.program, { expectTrace: corrupted }).then((replay) => {
                  const failed = failureOf(replay)
                  return Match.value(failed.failure).pipe(
                    Match.tag('ReplayTraceDiverged', (diverged) => ({
                      failedClosed: true,
                      atStepPositive: diverged.atStep > 0,
                    })),
                    Match.orElse(() => ({ failedClosed: false, atStepPositive: false })),
                  )
                })
              })
            ),
        ),
        Then('the run fails with a structured ReplayTraceDiverged failure naming a positive step')((s, expect) =>
          expect({
            failedClosed: s.facts.failedClosed,
            atStepPositive: s.facts.atStepPositive,
          }).toEqual({
            failedClosed: true,
            atStepPositive: true,
          })
        ),
      ),
    )
  })
