import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Array as Arr, Deferred, Effect, Layer, Match, Option, Queue, Scope } from 'effect'
import { settled, terminatedIn, traceUntil } from './__fixtures__/SupervisorHarness.js'

const Feature = makeFeature({ it })

type PortTask = Effect.Effect<void, never, Scope.Scope>

const FailingPort = Supervisor.Medium.MediumPort<PortTask, string, Scope.Scope>('FailingTestMedium')

Feature('Starting a child on a medium whose start fails')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A medium that cannot start its child leaves it reported as an abnormal termination',
      Gherkin.Do.pipe(
        Given('a supervisor that runs one child on a medium that will refuse to start it')(
          'tree',
          () =>
            Effect.gen(function*() {
              const startCalled = yield* Deferred.make<void>()
              const refuse = yield* Deferred.make<void>()
              const medium = Supervisor.Medium.make<PortTask, string>({
                declaration: { reporting: 'full', groupStop: 'atomic' },
                start: () =>
                  Effect.andThen(
                    Deferred.succeed(startCalled, void 0),
                    Effect.andThen(Deferred.await(refuse), Effect.fail('the medium refused')),
                  ),
                report: () => Effect.never,
                probe: () => Effect.succeed(false),
                stop: () => Effect.succeed(Supervisor.Medium.stopped),
              })
              const spec = Supervisor.make('failing-medium-tree').pipe(
                Supervisor.children([
                  Supervisor.ChildSpecs.on(FailingPort)('document', Effect.never, { restartType: 'temporary' }),
                ]),
              )
              return { startCalled, refuse, medium, spec }
            }),
        ),
        When('the medium refuses to start the child')('trace', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* tree.spec.scoped.pipe(
              Effect.provideService(FailingPort, { medium: tree.medium }),
            )
            yield* Deferred.await(tree.startCalled)
            const watching = yield* traceUntil(
              supervisor,
              (trace) =>
                Arr.some(trace, (entry) =>
                  Match.value(entry.event).pipe(
                    Match.tag('ChildTerminated', (terminated) => terminated.childId === 'document'),
                    Match.orElse(() => false),
                  )),
            )
            yield* Deferred.succeed(tree.refuse, void 0)
            return yield* settled(watching)
          })),
        Then('the supervisor reports that child as abnormally terminated')(({ trace }) => {
          const ending = Arr.findFirst(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildTerminated', (terminated) => terminated.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(ending).toSatisfy(Option.isSome)
          expect(Option.getOrThrow(ending).event).toMatchObject({
            _tag: 'ChildTerminated',
            reason: { _tag: 'Abnormal', report: { _tag: 'CauseReport' } },
          })
        }),
        And('nothing claims that child ever started')(({ trace }) => {
          const started = Arr.some(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildStarted', (started) => started.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(started).toBe(false)
        }),
      ),
    )

    scenario(
      'A permanent child whose medium keeps refusing to start it is restarted until the supervisor gives up',
      Gherkin.Do.pipe(
        Given('a supervisor whose one child always refuses to start')('tree', () =>
          Effect.gen(function*() {
            const refusals = yield* Queue.unbounded<void>()
            const medium = Supervisor.Medium.make<PortTask, string>({
              declaration: { reporting: 'full', groupStop: 'atomic' },
              start: () => Effect.andThen(Queue.take(refusals), Effect.fail('the medium refused')),
              report: () => Effect.never,
              probe: () => Effect.succeed(false),
              stop: () => Effect.succeed(Supervisor.Medium.stopped),
            })
            const spec = Supervisor.make('persistent-refusal-tree').pipe(
              Supervisor.children([
                Supervisor.ChildSpecs.on(FailingPort)('document', Effect.never, { restartType: 'permanent' }),
              ]),
            )
            return { refusals, medium, spec }
          })),
        When('the supervisor exhausts its restart intensity on refusal')('trace', ({ tree }) =>
          Effect.gen(function*() {
            const supervisor = yield* tree.spec.scoped.pipe(
              Effect.provideService(FailingPort, { medium: tree.medium }),
            )
            const watching = yield* traceUntil(supervisor, terminatedIn)
            yield* Effect.forEach(Arr.range(1, 4), () => Queue.offer(tree.refusals, void 0), { discard: true })
            return yield* settled(watching)
          })),
        Then('the supervisor gave up and terminated')(({ trace }) => {
          expect(trace).toSatisfy(terminatedIn)
        }),
        And('the refused child was reported abnormally terminated, never started')(({ trace }) => {
          const endings = Arr.filter(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildTerminated', (terminated) =>
                terminated.childId === 'document' &&
                Match.value(terminated.reason).pipe(
                  Match.tag('Abnormal', () => true),
                  Match.orElse(() => false),
                )),
              Match.orElse(() => false),
            ))
          expect(endings.length).toBeGreaterThan(0)
          const claimedStarted = Arr.filter(trace, (entry) =>
            Match.value(entry.event).pipe(
              Match.tag('ChildStarted', (started) => started.childId === 'document'),
              Match.orElse(() => false),
            ))
          expect(claimedStarted).toEqual([])
        }),
      ),
    )
  })
