import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Effect, Match, Ref } from 'effect'
import { fiberMediumLayer } from './__fixtures__/FiberMediumHarness.js'

const Feature = makeFeature({ it })

const phaseOf = (supervisor: Supervisor.RunningSupervisor): Effect.Effect<string> =>
  Effect.map(Supervisor.statusOf(supervisor), (state) =>
    Match.value(state).pipe(
      Match.tag('Terminated', () => 'terminated'),
      Match.orElse(() => 'running'),
    ))

const recordingChild = (
  log: Ref.Ref<ReadonlyArray<string>>,
  name: string,
  started: Deferred.Deferred<void>,
): Supervisor.FiberProgram =>
(ready) =>
  Effect.ensuring(
    Effect.andThen(
      Effect.andThen(ready, Ref.update(log, (seen) => Arr.append(seen, name))),
      Effect.andThen(Deferred.succeed(started, void 0), Effect.never),
    ),
    Ref.update(log, (seen) => Arr.append(seen, `${name} stopped`)),
  )

const twoRecordingChildren = Effect.gen(function*() {
  const log = yield* Ref.make<ReadonlyArray<string>>(Arr.empty<string>())
  const alphaStarted = yield* Deferred.make<void>()
  const betaStarted = yield* Deferred.make<void>()
  return {
    log,
    alphaStarted,
    betaStarted,
    spec: Supervisor.make('scope-close-tree').pipe(
      Supervisor.children([
        Supervisor.ChildSpecs.make('alpha', recordingChild(log, 'alpha', alphaStarted)),
        Supervisor.ChildSpecs.make('beta', recordingChild(log, 'beta', betaStarted)),
      ]),
    ),
  }
})

Feature('Shutting a supervision tree down when the scope it runs in closes')
  .withLayer(fiberMediumLayer)
  .body(({ scenario }) => {
    scenario(
      'The scope stops each child in reverse of the order it started that child',
      Gherkin.Do.pipe(
        Given('a supervisor running two children, each of which records its own shutdown')(
          'tree',
          () => twoRecordingChildren,
        ),
        When('the scope the supervisor was started in closes')('record', ({ tree }) =>
          Effect.gen(function*() {
            const started = yield* Effect.scoped(Effect.gen(function*() {
              yield* tree.spec.scoped
              yield* Deferred.await(tree.alphaStarted)
              yield* Deferred.await(tree.betaStarted)
              return yield* Ref.get(tree.log)
            }))
            const afterwards = yield* Ref.get(tree.log)
            return { started, afterwards }
          })),
        Then('the children stopped in reverse of the order the supervisor started them')(
          ({ record }, expect) =>
            expect({
              started: [...record.started].sort(),
              stopped: record.afterwards.slice(2),
            }).toEqual({
              started: ['alpha', 'beta'],
              stopped: ['beta stopped', 'alpha stopped'],
            }),
        ),
      ),
    )

    scenario(
      'A supervisor that runs no children still finishes terminating',
      Gherkin.Do.pipe(
        Given('a supervisor that runs no children')(
          'tree',
          () => Effect.succeed({ spec: Supervisor.make('childless-tree') }),
        ),
        When('the scope it was started in closes')('phase', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* Effect.scoped(tree.spec.scoped)
            yield* Supervisor.awaitTerminated(supervisor)
            return yield* phaseOf(supervisor)
          })),
        Then('the supervisor has terminated')(({ phase }, expect) => expect(phase).toBe('terminated')),
      ),
    )
  })
