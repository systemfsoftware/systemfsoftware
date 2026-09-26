import { Cause, Deferred, Effect, Exit, Fiber, Option } from 'effect'
import type { Duration } from 'effect'
import type * as Scope from 'effect/Scope'

import { Conformance } from '@systemfsoftware/conformance-spec'

import { ruleFrom } from './Rules.js'

export interface JobFailed {
  readonly _tag: 'JobFailed'
  readonly job: number
}

export type RunJob = (job: number) => Effect.Effect<void, JobFailed>

export type Ending =
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed'; readonly job: number }
  | { readonly _tag: 'Stopped' }

export interface Worker {
  readonly ended: Effect.Effect<Ending>
}

export type StartWorker = (jobs: ReadonlyArray<number>, run: RunJob) => Effect.Effect<Worker, never, Scope.Scope>

export const workerJobs: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6]

export const workerStopWithin: Duration.Input = '1 second'

const jobTime = '10 millis'

export interface WorkerWorld {
  readonly processed: Array<number>
  readonly failed: Array<number>
  readonly answers: Array<string>
  readonly poison: number | undefined
}

export const workerWorldOf = (poison: number | undefined): Effect.Effect<WorkerWorld> =>
  Effect.sync(() => ({ processed: [], failed: [], answers: [], poison }))

const runOver = (world: WorkerWorld): RunJob => (job) =>
  Effect.andThen(
    Effect.sleep(jobTime),
    Effect.suspend(() => {
      if (job === world.poison) {
        world.failed.push(job)
        return Effect.fail({ _tag: 'JobFailed', job } as const)
      }
      world.processed.push(job)
      return Effect.void
    }),
  )

const endingOf = (exit: Exit.Exit<void, JobFailed>): Ending => {
  if (Exit.isSuccess(exit)) return { _tag: 'Done' }
  const error = Cause.findErrorOption(exit.cause)
  return Option.isSome(error) ? { _tag: 'Failed', job: error.value.job } : { _tag: 'Stopped' }
}

const watchingTheFiber: StartWorker = (jobs, run) =>
  Effect.map(Effect.forkScoped(Effect.forEach(jobs, run, { discard: true })), (fiber) => ({
    ended: Effect.map(Fiber.await(fiber), endingOf),
  }))

const answeringAfterwards: StartWorker = (jobs, run) =>
  Effect.gen(function*() {
    const done = yield* Deferred.make<Ending>()
    yield* Effect.forkScoped(
      Effect.andThen(Effect.forEach(jobs, run, { discard: true }), Deferred.succeed(done, { _tag: 'Done' })),
    )
    return { ended: Deferred.await(done) }
  })

export type WorkerImplementation = (world: WorkerWorld) => Effect.Effect<void, never, Scope.Scope>

const runBy = (start: StartWorker) => (world: WorkerWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const worker = yield* start(workerJobs, runOver(world))
    const answer = yield* worker.ended
    yield* Effect.sync(() => {
      world.answers.push(answer._tag)
    })
  })

export const watching = runBy(watchingTheFiber)

export const answeringNextStep = runBy(answeringAfterwards)

const answeredDone = (world: WorkerWorld): boolean => world.answers[0] === 'Done'

const shortOfJobs = (world: WorkerWorld): string | undefined =>
  world.processed.length === workerJobs.length
    ? undefined
    : `said Done after ${world.processed.length}/${workerJobs.length} jobs`

export const workerRule = (
  world: WorkerWorld,
): string | undefined => (answeredDone(world) ? shortOfJobs(world) : undefined)

export interface WorkerScenario {
  readonly start: WorkerImplementation
  readonly poison: number | undefined
}

export interface WorkerSpec {
  readonly unit: WorkerImplementation
  readonly world: Effect.Effect<WorkerWorld>
  readonly program: (world: WorkerWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly restart: (world: WorkerWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly rule: (world: WorkerWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const workerSpec = (scenario: WorkerScenario): WorkerSpec => ({
  unit: scenario.start,
  world: workerWorldOf(scenario.poison),
  program: scenario.start,
  restart: () => Effect.void,
  rule: (world) => ruleFrom(workerRule(world)),
  stopWithin: workerStopWithin,
})
