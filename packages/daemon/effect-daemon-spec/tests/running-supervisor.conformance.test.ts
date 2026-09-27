import { Conformance } from '@systemfsoftware/conformance-spec'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Exit, Fiber, Layer, Match } from 'effect'
import type * as Scope from 'effect/Scope'

const Feature = makeFeature({ it })

const STEADY = 'steady'
const DYNAMIC = 'dynamic'
const A_TICK = '20 millis'

interface RunSnapshot {
  readonly started: ReadonlyArray<string>
  readonly leftRunning: ReadonlyArray<string>
}

interface SupervisorWorld {
  readonly answers: Array<string>
  readonly started: Array<string>
  readonly stopped: Array<string>
  readonly snapshots: Array<RunSnapshot>
}

const worldOf = (): SupervisorWorld => ({ answers: [], started: [], stopped: [], snapshots: [] })

const childOf = (
  world: SupervisorWorld,
  name: string,
  cleanUpFor: Duration.Input = '0 millis',
): Supervisor.FiberProgram =>
(ready) =>
  Effect.ensuring(
    Effect.andThen(Effect.sync(() => world.started.push(name)), Effect.andThen(ready, Effect.never)),
    Effect.andThen(Effect.sleep(cleanUpFor), Effect.sync(() => world.stopped.push(name))),
  )

const runningAfterTheStop = (world: SupervisorWorld): Array<string> =>
  world.started.filter((name) => !world.stopped.includes(name))

const noteRunEnded = (world: SupervisorWorld): Effect.Effect<void> =>
  Effect.sync(() => {
    world.snapshots.push({ started: [...world.started], leftRunning: runningAfterTheStop(world) })
  })

const steadyChild = (world: SupervisorWorld): Supervisor.FiberProgram => childOf(world, STEADY, '5 millis')

const dynamicStoppedSession = (
  world: SupervisorWorld,
): Effect.Effect<void, Supervisor.SupervisorTerminated, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => noteRunEnded(world))
    const supervisor = yield* Supervisor.make('checked').pipe(
      Supervisor.dynamic({ ceiling: 4 }),
      Supervisor.children([
        Supervisor.ChildSpecs.make(STEADY, steadyChild(world), { restartType: 'temporary' }),
      ]),
    ).scoped
    const started = yield* Supervisor.startChild(supervisor, childOf(world, DYNAMIC))
    yield* Effect.sync(() => world.answers.push(`start:${started.outcome}`))
    yield* Effect.sleep(A_TICK)
    yield* Match.value(started).pipe(
      Match.when({ outcome: 'accepted' }, (accepted) =>
        Effect.flatMap(
          Supervisor.stopChild(supervisor, accepted.childId, accepted.generation),
          (stopped) => Effect.sync(() => world.answers.push(`stop:${stopped.outcome}`)),
        )),
      Match.orElse(() => Effect.void),
    )
    yield* Effect.catchTag(Supervisor.shutdown(supervisor), 'SupervisorTerminated', () => Effect.void)
  })

const awaitedSession = (world: SupervisorWorld): Effect.Effect<void, Supervisor.SupervisorTerminated, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => noteRunEnded(world))
    const supervisor = yield* Supervisor.make('waited').pipe(
      Supervisor.children([Supervisor.ChildSpecs.make(STEADY, steadyChild(world))]),
    ).scoped
    const waiting = yield* Effect.forkScoped(
      Effect.flatMap(
        Effect.exit(Supervisor.awaitTerminated(supervisor)),
        (exit) => Effect.sync(() => world.answers.push(Exit.isSuccess(exit) ? 'waiter:answered' : 'waiter:gave-up')),
      ),
    )
    yield* Effect.sync(() => world.answers.push('waiter:watched'))
    yield* Effect.sleep(A_TICK)
    yield* Effect.catchTag(Supervisor.shutdown(supervisor), 'SupervisorTerminated', () => Effect.void)
    yield* Effect.sync(() => world.answers.push('terminated'))
    yield* Fiber.join(waiting)
  })

const scopedSession = (world: SupervisorWorld): Effect.Effect<void, Supervisor.SupervisorTerminated, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => noteRunEnded(world))
    const supervisor = yield* Effect.scoped(
      Effect.gen(function*() {
        const started = yield* Supervisor.make('scoped').pipe(
          Supervisor.children([Supervisor.ChildSpecs.make(STEADY, steadyChild(world), { restartType: 'temporary' })]),
        ).scoped
        yield* Effect.sleep(A_TICK)
        return started
      }),
    )
    yield* Supervisor.awaitTerminated(supervisor)
  })

const mediumStoppedSession = (world: SupervisorWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => noteRunEnded(world))
    const started = yield* Supervisor.FiberMedium.medium.start(childOf(world, DYNAMIC))
    yield* Effect.sleep(A_TICK)
    yield* Supervisor.FiberMedium.medium.stop(started, {
      _tag: 'Graceful',
      millis: Supervisor.FiberMedium.FIBER_CHILD_STOP_WINDOW_MILLIS,
    })
    yield* Effect.sync(() => world.answers.push('medium:stopped'))
  })

const restarted = <E>(
  session: (world: SupervisorWorld) => Effect.Effect<void, E, Scope.Scope>,
) =>
(world: SupervisorWorld): Effect.Effect<void, E, Scope.Scope> =>
  Effect.andThen(
    Effect.sync(() => {
      world.answers.splice(0)
      world.started.splice(0)
      world.stopped.splice(0)
    }),
    session(world),
  )

const snapshotBrokenBy = (world: SupervisorWorld): string | undefined => {
  const leftRunning = world.snapshots.find((snapshot) => snapshot.leftRunning.length > 0)
  if (leftRunning !== undefined) {
    return `left ${leftRunning.leftRunning.length} child(ren) running after the stop: ${
      leftRunning.leftRunning.join(', ')
    }`
  }
  return world.snapshots.some((snapshot) => snapshot.started.length > 0)
    ? undefined
    : 'the run never started a child, so nothing was observed to have been left running'
}

const answerBrokenBy = (world: SupervisorWorld): string | undefined => {
  if (world.answers.includes('stop:stopped') && world.started.includes(DYNAMIC) && !world.stopped.includes(DYNAMIC)) {
    return 'answered a dynamic stop as stopped without stopping the child that was running'
  }
  if (world.answers.includes('waiter:watched') && !world.answers.includes('waiter:answered')) {
    return 'did not answer the waiter on awaitTerminated'
  }
  return undefined
}

const ruleBrokenBy = (world: SupervisorWorld): string | undefined => snapshotBrokenBy(world) ?? answerBrokenBy(world)

const ruleOf = (
  brokenBy: (world: SupervisorWorld) => string | undefined,
) =>
(world: SupervisorWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Match.value(brokenBy(world)).pipe(
    Match.when(undefined, () => Effect.void),
    Match.orElse((message) => Effect.fail(Conformance.RuleBroken.make({ message }))),
  )

const rule = ruleOf(ruleBrokenBy)

const stopWindow = Duration.millis(Supervisor.FiberMedium.FIBER_CHILD_STOP_WINDOW_MILLIS)

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

Feature('Stopping a running supervisor', { timeout: 0 })
  .withLayer(Layer.empty)
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A supervisor stopped at every step answers its dynamic callers and leaves no child running',
      Gherkin.Do.pipe(
        Given('a world that records what each child of the supervisor does')('world', () => Effect.succeed(worldOf)),
        When('the supervisor starts a child on request, stops it, and is told to stop at every step')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Supervisor.startChild,
              world: Effect.sync(s.world),
              program: dynamicStoppedSession,
              restart: restarted(dynamicStoppedSession),
              rule,
              stopWithin: stopWindow,
            }),
        ),
        Then('every cut passes, and the check tried at least one')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'A waiter on awaitTerminated is answered when the supervisor is told to stop at every step',
      Gherkin.Do.pipe(
        Given('a world that records what each child of the supervisor does')('world', () => Effect.succeed(worldOf)),
        When('an outside fiber waits on the supervisor and the supervisor is stopped at every step')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Supervisor.awaitTerminated,
              world: Effect.sync(s.world),
              program: awaitedSession,
              restart: restarted(awaitedSession),
              rule,
              stopWithin: stopWindow,
            }),
        ),
        Then('every cut passes, and the check tried at least one')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'A supervisor whose own scope closes answers its waiters and leaves no child running',
      Gherkin.Do.pipe(
        Given('a world that records what each child of the supervisor does')('world', () => Effect.succeed(worldOf)),
        When('the scope the supervisor was started in closes at every step of its life')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Supervisor.make,
              world: Effect.sync(s.world),
              program: scopedSession,
              restart: restarted(scopedSession),
              rule,
              stopWithin: stopWindow,
            }),
        ),
        Then('every cut passes, and the check tried at least one')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )

    scenario(
      'The fiber medium stopped at every step closes its child scope before the stop returns',
      Gherkin.Do.pipe(
        Given('a world that records what each child of the medium does')('world', () => Effect.succeed(worldOf)),
        When('the medium starts a child and stops it at every step of that life')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Supervisor.FiberMedium.medium,
              world: Effect.sync(s.world),
              program: mediumStoppedSession,
              restart: restarted(mediumStoppedSession),
              rule,
              stopWithin: stopWindow,
            }),
        ),
        Then('every cut passes, and the check tried at least one')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )
  })
