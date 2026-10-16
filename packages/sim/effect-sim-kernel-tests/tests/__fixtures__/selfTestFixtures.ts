import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Exit, Fiber, Ref } from 'effect'
import { checkThenSet } from './searchFixtures.js'

type RaceProgram = Effect.Effect<ReadonlyArray<boolean>>

export type RaceFinding = Kernel.SearchFailure<ReadonlyArray<boolean>, never> | undefined

export type WrapperVariant = {
  readonly protection: string
  readonly program: RaceProgram
}

export const wrapperVariants: ReadonlyArray<WrapperVariant> = [
  { protection: 'with no interruption protection', program: checkThenSet },
  { protection: 'inside a region protected from interruption', program: Effect.uninterruptible(checkThenSet) },
  {
    protection: 'inside a region protected from interruption that can be lifted partway',
    program: Effect.uninterruptibleMask(() => checkThenSet),
  },
  {
    protection: 'while claiming a resource that is always given back',
    program: Effect.scoped(Effect.acquireRelease(checkThenSet, () => Effect.void)),
  },
]

export const guardedInOneStep: RaceProgram = Effect.gen(function*() {
  const holder = yield* Ref.make<string | null>(null)
  const tryAcquire = (who: string) =>
    Ref.modify(
      holder,
      (current): readonly [boolean, string | null] => current === null ? [true, who] : [false, current],
    )
  const first = yield* Effect.forkChild(tryAcquire('a'))
  const second = yield* Effect.forkChild(tryAcquire('b'))
  const firstResult = yield* Fiber.join(first)
  const secondResult = yield* Fiber.join(second)
  return [firstResult, secondResult]
})

/** Both workers report taking the slot: the failure every one-pause search hunts. */
const bothHolding = (result: Kernel.RunResult<ReadonlyArray<boolean>, never>): boolean => {
  if (!('exit' in result) || !Exit.isSuccess(result.exit)) return false
  const value: ReadonlyArray<boolean> = result.exit.value
  return value[0] === true && value[1] === true
}

/** First schedule leaving both workers holding the slot, for the pauses allowed. */
export const firstRaceFinding = (preemptions: number) => (program: RaceProgram): Promise<RaceFinding> =>
  Kernel.search(program, { preemptions, isFailure: bothHolding }).then((outcome) => outcome.failures[0])

const exitOf = (
  result: Kernel.RunResult<ReadonlyArray<boolean>, never>,
): Exit.Exit<ReadonlyArray<boolean>, never> | undefined => ('exit' in result ? result.exit : undefined)

export const raceValueOf = (finding: RaceFinding): ReadonlyArray<boolean> | undefined => {
  if (finding === undefined) return undefined
  const exit = exitOf(finding.result)
  return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
}
