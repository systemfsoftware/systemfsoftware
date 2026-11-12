import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Fiber, Layer, Queue, Stream } from 'effect'

const Feature = makeFeature({ it })

/**
 * A scope that acquires a resource, does enough work to yield automatically under
 * the kernel's one-operation slices, starts a reader, and then finishes after the
 * reader takes a value. Effect 4.1.4 resumes automatic yields through `evaluate`
 * itself, so a stop can land on either side of that resumption.
 */
const scopeWithReader = (receipts: Array<string>) =>
  Effect.scoped(
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          receipts.push('acquired')
        }),
        () =>
          Effect.sync(() => {
            receipts.push('released')
          }),
      )
      yield* Effect.forEach(Array.from({ length: 20 }), (index) => Effect.sync(() => index), { discard: true })
      const reader = yield* Effect.forkScoped(Stream.runHead(Stream.fromQueue(queue)))
      yield* Queue.offer(queue, 1)
      return yield* Fiber.join(reader)
    }),
  )

/** Stops the scope after each step of its run, and returns the steps that left the resource acquired. */
const leaksAtEveryStop = async (): Promise<ReadonlyArray<number>> => {
  const whole = await Kernel.run(scopeWithReader([]))
  const leaks: Array<number> = []
  for (let step = 1; step <= whole.steps.length; step++) {
    const receipts: Array<string> = []
    await Kernel.run(scopeWithReader(receipts), { interrupt: { atStep: step } })
    if (receipts.includes('acquired') && !receipts.includes('released')) leaks.push(step)
  }
  return leaks
}

Feature('A scope whose work yields automatically still releases its resource when stopped')
  .live("reproduces the defect on Effect 4.1.4's automatic yields, which the kernel must follow")
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A scope stopped after any step releases the resource it acquired',
      Gherkin.Do.pipe(
        Given('a scope that acquires a resource, works through enough steps to yield, and starts a reader')(
          'scope',
          () => Effect.succeed(scopeWithReader),
        ),
        When('the scope is stopped after each step of its run')(
          'leaks',
          () => Effect.promise(() => leaksAtEveryStop()),
        ),
        Then('no stop leaves the acquired resource unreleased')((s, expect) => expect(s.leaks).toEqual([])),
      ),
    )
  })
