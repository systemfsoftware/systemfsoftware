import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { providedWorkspaceRoot, type RecordedRun } from '@systemfsoftware/vitest/failure'
import { Effect, Option, Queue } from 'effect'
import { fileURLToPath } from 'node:url'
import { fiberMediumLayer } from '../FiberMediumHarness.js'
import { ChildCrash } from './crash.schema.js'
import type { CorpusFixture } from './record.js'

const thisFile = fileURLToPath(import.meta.url)

const defectFileAsRecordPrints = Option.match(Option.fromNullishOr(providedWorkspaceRoot()), {
  onNone: () => thisFile,
  onSome: (workspaceRoot) => thisFile.replace(`${workspaceRoot}/`, ''),
})

const crashingChild = (crashes: Queue.Queue<void>): Supervisor.FiberProgram =>
  Supervisor.readyOnStart(
    Effect.andThen(Queue.take(crashes), Effect.die(new ChildCrash({ detail: 'the crasher lost its basket' }))),
  )

const crashingTree = Effect.gen(function*() {
  const crashes = yield* Queue.unbounded<void>()
  const supervisor = yield* Supervisor.make('root').pipe(
    Supervisor.intensity(0, 5_000),
    Supervisor.children([Supervisor.ChildSpecs.make('crasher', crashingChild(crashes))]),
  ).scoped
  return { crashes, supervisor }
})

const giveUpOf = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<never, Supervisor.SupervisorTerminated> =>
  Effect.matchEffect(Supervisor.awaitTerminated(supervisor), {
    onFailure: (terminated) => Effect.fail(terminated),
    onSuccess: () => Effect.die('the supervisor ended without giving up'),
  })

const program: RecordedRun<void, Supervisor.SupervisorTerminated> = () =>
  Effect.gen(function*() {
    const { crashes, supervisor } = yield* crashingTree
    yield* Queue.offer(crashes, void 0)
    return yield* giveUpOf(supervisor)
  }).pipe(Effect.scoped, Effect.provide(fiberMediumLayer))

export const giveUp: CorpusFixture<Supervisor.SupervisorTerminated> = {
  name: 'a supervisor that gave up on its crashing child',
  defectFile: defectFileAsRecordPrints,
  raisingFile: defectFileAsRecordPrints,
  program,
}
