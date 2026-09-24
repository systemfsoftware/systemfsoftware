import { expect } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Duration, Effect, Exit, Fiber, Match, Ref, Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'
import { settled } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type TerminationReason = Supervisor.Medium.TerminationReason
type FiberMedium = Supervisor.Medium.Medium<Supervisor.FiberProgram, never, Scope.Scope>
type FiberMediumPort = Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>

const fiberMedium: Effect.Effect<FiberMedium, never, FiberMediumPort> = Effect.map(
  Supervisor.FiberMedium.fiberPort,
  ({ medium }) => medium,
)

const startedInChildScope = (program: Supervisor.FiberProgram) =>
  Effect.gen(function*() {
    const medium = yield* fiberMedium
    const parent = yield* Effect.scope
    const childScope = yield* Scope.fork(parent)
    const started = yield* medium.start(program).pipe(Scope.provide(childScope))
    return { medium, childScope, started }
  })

const startInChildScope = (program: Supervisor.FiberMedium.BareFiberProgram) =>
  startedInChildScope(Supervisor.FiberMedium.readyOnStart(program))

const causeOf = (reason: TerminationReason): string =>
  Match.value(reason).pipe(
    Match.when({ _tag: 'Abnormal' }, (abnormal) =>
      Match.value(abnormal.report).pipe(
        Match.when({ _tag: 'CauseReport' }, (report) => report.cause),
        Match.orElse(() => ''),
      )),
    Match.orElse(() => ''),
  )

const stillWaiting = (ready: Effect.Effect<void>): Effect.Effect<boolean> =>
  Effect.raceFirst(Effect.as(ready, false), Effect.as(Effect.yieldNow, true))

const childThatFinishesASecondAfterItsInterruption = () =>
  Effect.gen(function*() {
    const entered = yield* Deferred.make<void>()
    const interrupted = yield* Ref.make(false)
    const child = yield* startInChildScope(
      Effect.gen(function*() {
        yield* Deferred.succeed(entered, void 0)
        return yield* Effect.never
      }).pipe(
        Effect.onInterrupt(() => Effect.andThen(Ref.set(interrupted, true), Effect.sleep(Duration.millis(1_000)))),
      ),
    )
    yield* Deferred.await(entered)
    return { ...child, interrupted }
  })

const childThatRecordsItsInterruption = () =>
  Effect.gen(function*() {
    const entered = yield* Deferred.make<void>()
    const interrupted = yield* Ref.make(false)
    const child = yield* startInChildScope(
      Effect.gen(function*() {
        yield* Deferred.succeed(entered, void 0)
        return yield* Effect.never
      }).pipe(Effect.onInterrupt(() => Ref.set(interrupted, true))),
    )
    yield* Deferred.await(entered)
    return { ...child, interrupted }
  })

Feature("Running a child in the supervisor's own process")
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'A child that succeeds is reported as a normal termination',
      Gherkin.Do.pipe(
        Given('a child that finishes as soon as it starts')('child', () => startInChildScope(Effect.void)),
        When('the medium is asked why that child ended')('reason', ({ child }) => child.medium.report(child.started)),
        Then('the child is reported as having ended normally')(({ reason }) => {
          expect(reason).toEqual({ _tag: 'Normal' })
        }),
      ),
    )

    scenario(
      'A child that dies is reported as an abnormal termination carrying its cause',
      Gherkin.Do.pipe(
        Given('a child that dies as soon as it starts')('child', () => startInChildScope(Effect.die('boom'))),
        When('the medium is asked why that child ended')('reason', ({ child }) => child.medium.report(child.started)),
        Then('the child is reported as having ended abnormally, carrying its cause')(({ reason }) => {
          expect(causeOf(reason)).toContain('boom')
          expect(causeOf(reason)).not.toBe('')
        }),
      ),
    )

    scenario(
      'A child that interrupts itself is reported as a shutdown',
      Gherkin.Do.pipe(
        Given('a child that interrupts itself as soon as it starts')(
          'child',
          () => startInChildScope(Effect.interrupt),
        ),
        When('the medium is asked why that child ended')('reason', ({ child }) => child.medium.report(child.started)),
        Then('the child is reported as having been shut down')(({ reason }) => {
          expect(reason).toEqual({ _tag: 'Shutdown' })
        }),
      ),
    )

    scenario(
      'A child is not ready until it says so',
      Gherkin.Do.pipe(
        Given('a child that waits for a gate before it says it is ready')('child', () =>
          Effect.gen(function*() {
            const gate = yield* Deferred.make<void>()
            const child = yield* startedInChildScope((ready) =>
              Effect.gen(function*() {
                yield* Deferred.await(gate)
                yield* ready
                return yield* Effect.never
              })
            )
            return { ...child, gate }
          })),
        When('the child is asked whether it is ready while its gate stays closed')(
          'waiting',
          ({ child }) => stillWaiting(child.started.ready),
        ),
        When('the gate opens')(
          'ready',
          ({ child }) => Effect.as(Effect.andThen(Deferred.succeed(child.gate, void 0), child.started.ready), true),
        ),
        Then('the child does not say it is ready while its gate stays closed')(({ waiting }) => {
          expect(waiting).toBe(true)
        }),
        And('the child says it is ready once its gate opens')(({ ready }) => {
          expect(ready).toBe(true)
        }),
      ),
    )

    scenario(
      'A child that is ready when it starts never waits',
      Gherkin.Do.pipe(
        Given('a child that says it is ready as it starts and then runs forever')(
          'child',
          () => startInChildScope(Effect.never),
        ),
        When('the medium waits for that child to say it is ready')(
          'ready',
          ({ child }) => Effect.as(child.started.ready, true),
        ),
        Then('the child is ready without any further signal')(({ ready }) => {
          expect(ready).toBe(true)
        }),
      ),
    )

    scenario(
      'A brutal stop interrupts the child and waits for its finishing work',
      Gherkin.Do.pipe(
        Given('a child that records its interruption and then takes a second to finish')(
          'child',
          () => childThatFinishesASecondAfterItsInterruption(),
        ),
        When('the medium stops the child without a deadline of its own')(
          'stopped',
          ({ child }) =>
            Effect.gen(function*() {
              const stopping = yield* Effect.forkScoped(child.medium.stop(child.started, { _tag: 'Brutal' }))
              const stillFinishing = yield* Effect.raceFirst(
                Fiber.await(stopping).pipe(Effect.as(false)),
                Effect.as(Effect.yieldNow, true),
              )
              yield* settled(stopping)
              return {
                interrupted: yield* Ref.get(child.interrupted),
                reason: yield* child.medium.report(child.started),
                running: yield* child.medium.probe(child.started),
                stillFinishing,
              }
            }),
        ),
        Then('the child was interrupted')(({ stopped }) => {
          expect(stopped.interrupted).toBe(true)
        }),
        And('the stop was still waiting while the child finished its work')(({ stopped }) => {
          expect(stopped.stillFinishing).toBe(true)
        }),
        And('the child is no longer running once it finishes')(({ stopped }) => {
          expect(stopped.reason).toEqual({ _tag: 'Shutdown' })
          expect(stopped.running).toBe(false)
        }),
      ),
    )

    scenario(
      'A graceful stop stops a child that never finishes',
      Gherkin.Do.pipe(
        Given('a child that never finishes and is given a hundred milliseconds to stop')(
          'child',
          () =>
            Effect.gen(function*() {
              const never = yield* Deferred.make<void>()
              return yield* startInChildScope(Effect.asVoid(Effect.andThen(Deferred.await(never), Effect.never)))
            }),
        ),
        When('the medium stops the child gracefully')('stopped', ({ child }) =>
          Effect.gen(function*() {
            const stopping = yield* Effect.forkScoped(
              child.medium.stop(child.started, { _tag: 'Graceful', millis: 100 }),
            )
            yield* settled(stopping)
            return { running: yield* child.medium.probe(child.started) }
          })),
        Then('the child is no longer running')(({ stopped }) => {
          expect(stopped.running).toBe(false)
        }),
      ),
    )

    scenario(
      'A graceful stop signals the child as soon as it begins',
      Gherkin.Do.pipe(
        Given('a child that records its interruption')('child', () => childThatRecordsItsInterruption()),
        When('the medium stops the child gracefully with a wide window')(
          'stopped',
          ({ child }) =>
            Effect.gen(function*() {
              yield* child.medium.stop(child.started, { _tag: 'Graceful', millis: 5_000 })
              return {
                interrupted: yield* Ref.get(child.interrupted),
                reason: yield* child.medium.report(child.started),
                running: yield* child.medium.probe(child.started),
              }
            }),
        ),
        Then('the child was interrupted as soon as the stop began')(({ stopped }) => {
          expect(stopped.interrupted).toBe(true)
        }),
        And('the child is no longer running')(({ stopped }) => {
          expect(stopped.reason).toEqual({ _tag: 'Shutdown' })
          expect(stopped.running).toBe(false)
        }),
      ),
    )

    scenario(
      'A stop with no deadline waits for the child to finish',
      Gherkin.Do.pipe(
        Given('a child that records its interruption and then takes a second to finish')(
          'child',
          () => childThatFinishesASecondAfterItsInterruption(),
        ),
        When('the medium stops the child without a deadline')('stopped', ({ child }) =>
          Effect.gen(function*() {
            const stopping = yield* Effect.forkScoped(child.medium.stop(child.started, { _tag: 'Infinity' }))
            const stillFinishing = yield* Effect.raceFirst(
              Fiber.await(stopping).pipe(Effect.as(false)),
              Effect.as(Effect.yieldNow, true),
            )
            yield* settled(stopping)
            return {
              interrupted: yield* Ref.get(child.interrupted),
              reason: yield* child.medium.report(child.started),
              running: yield* child.medium.probe(child.started),
              stillFinishing,
            }
          })),
        Then('the child was interrupted')(({ stopped }) => {
          expect(stopped.interrupted).toBe(true)
        }),
        And('the stop was still waiting while the child finished its work')(({ stopped }) => {
          expect(stopped.stillFinishing).toBe(true)
        }),
        And('the child is no longer running once it finishes')(({ stopped }) => {
          expect(stopped.reason).toEqual({ _tag: 'Shutdown' })
          expect(stopped.running).toBe(false)
        }),
      ),
    )

    scenario(
      "Closing the child's own scope runs its finishing work",
      Gherkin.Do.pipe(
        Given('a child that has finishing work to do when its scope closes')('child', () =>
          Effect.gen(function*() {
            const finished = yield* Ref.make(false)
            const born = yield* Deferred.make<void>()
            const child = yield* startInChildScope(
              Effect.gen(function*() {
                yield* Effect.addFinalizer(() => Ref.set(finished, true))
                yield* Deferred.succeed(born, void 0)
                return yield* Effect.never
              }),
            )
            yield* Deferred.await(born)
            return { ...child, finished }
          })),
        When("the child's own scope closes")(
          'closed',
          ({ child }) => Effect.andThen(Scope.close(child.childScope, Exit.void), Ref.get(child.finished)),
        ),
        Then('the child ran its finishing work')(({ closed }) => {
          expect(closed).toBe(true)
        }),
      ),
    )

    scenario(
      'A stop finishes even when its caller gives up on it',
      Gherkin.Do.pipe(
        Given('a child that records its interruption and then takes a second to finish')(
          'child',
          () => childThatFinishesASecondAfterItsInterruption(),
        ),
        When('the caller gives up on the stop before the child finishes')(
          'stopped',
          ({ child }) =>
            Effect.gen(function*() {
              const stopping = yield* Effect.forkScoped(child.medium.stop(child.started, { _tag: 'Brutal' }))
              const gaveUp = yield* Effect.forkScoped(Fiber.interrupt(stopping))
              yield* Effect.raceFirst(
                Fiber.await(gaveUp),
                Effect.forever(TestClock.adjust(Duration.millis(10))),
              )
              return {
                interrupted: yield* Ref.get(child.interrupted),
                running: yield* child.medium.probe(child.started),
              }
            }),
        ),
        Then('the child was interrupted')(({ stopped }) => {
          expect(stopped.interrupted).toBe(true)
        }),
        And('the child is no longer running although the caller gave up')(({ stopped }) => {
          expect(stopped.running).toBe(false)
        }),
      ),
    )
  })
