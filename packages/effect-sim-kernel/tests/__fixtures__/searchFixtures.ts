import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Exit, Fiber, Queue, Ref } from 'effect'

export const checkThenSet: Effect.Effect<ReadonlyArray<boolean>> = Effect.gen(function*() {
  const holder = yield* Ref.make<string | null>(null)
  const tryAcquire = (who: string) =>
    Effect.gen(function*() {
      const current = yield* Ref.get(holder)
      if (current !== null) return false
      yield* Ref.set(holder, who)
      return true
    })
  const first = yield* Effect.forkChild(tryAcquire('a'))
  const second = yield* Effect.forkChild(tryAcquire('b'))
  const firstResult = yield* Fiber.join(first)
  const secondResult = yield* Fiber.join(second)
  return [firstResult, secondResult]
})

export const queueProgram: Effect.Effect<number> = Effect.gen(function*() {
  const queue = yield* Queue.unbounded<number>()
  yield* Queue.offer(queue, 1)
  return yield* Queue.take(queue)
})

export const scopedProgram: Effect.Effect<ReadonlyArray<string>> = Effect.gen(function*() {
  const events: Array<string> = []
  const acquire = Effect.sync(() => {
    events.push('acquired')
    return 'resource'
  })
  const release = () =>
    Effect.sync(() => {
      events.push('released')
    })
  yield* Effect.scoped(Effect.acquireRelease(acquire, release))
  return events
})

export const isOverBudget = <A, E>(outcome: Kernel.SearchReport<A, E>): boolean => 'limit' in outcome

export const budgetLimitOf = <A, E>(outcome: Kernel.SearchReport<A, E>): Kernel.BudgetLimit | undefined =>
  'limit' in outcome ? outcome.limit : undefined

export const outcomeBound = <A, E>(outcome: Kernel.SearchReport<A, E>): Kernel.Bound => outcome.bound

export const outcomeFailures = <A, E>(outcome: Kernel.SearchReport<A, E>): ReadonlyArray<Kernel.SearchFailure<A, E>> =>
  outcome.failures

const exitOf = <A, E>(result: Kernel.RunResult<A, E>): Exit.Exit<A, E> | undefined =>
  'exit' in result ? result.exit : undefined

export const firstFailureValue = <A, E>(outcome: Kernel.SearchReport<A, E>): A | undefined => {
  const first = outcome.failures[0]
  if (first === undefined) return undefined
  const exit = exitOf(first.result)
  return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
}

export const replayValueOf = <A, E>(outcome: Kernel.ShrinkOutcome<A, E>): A | undefined => {
  const exit = exitOf(outcome.result)
  return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
}

export const deviationCountOf = <A, E>(result: Kernel.RunResult<A, E>): number =>
  result.steps.filter((step) => step.deviation).length

/** The race the check-then-set workers lose: both report taking the slot. */
export const raceDetected = (result: Kernel.RunResult<ReadonlyArray<boolean>, never>): boolean => {
  const exit = exitOf(result)
  if (exit === undefined || !Exit.isSuccess(exit)) return false
  const value = exit.value
  return value[0] === true && value[1] === true
}
